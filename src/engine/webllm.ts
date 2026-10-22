// Real backend: open models running in-browser via WebLLM (WebGPU).
// Full internals the API can expose: per-token logprobs (top-k), timings.
// Weights are cached by the runtime in IndexedDB/CacheStorage after first load.
import * as webllm from '@mlc-ai/web-llm'
import type {
  BackendCapabilities,
  GenerateRequest,
  GenerateResult,
  LoadProgress,
  ModelBackend,
  ModelSpec,
  TokenEvent,
  TopKEntry,
} from './types'

export const WEBLLM_CAPABILITIES: BackendCapabilities = {
  logprobs: 'full-vocab',
  maxTopLogprobs: 5,
  attention: false, // chat API does not return attention maps
  hiddenStates: false,
  tokenizerAccess: false, // reply tokens come from logprobs; prompt tokenization is a v2 seam
  runsWhere: 'browser-webgpu',
}

/** Decode byte-level token spellings (Ġ -> space, Ċ -> newline, ...) */
function decodeToken(t: string): string {
  return t
    .replace(/Ġ/g, ' ')
    .replace(/Ċ/g, '\n')
    .replace(/ĉ/g, '\t')
    .replace(/<0x([0-9A-Fa-f]{2})>/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export class WebLLMBackend implements ModelBackend {
  readonly id = 'webllm'
  readonly capabilities = WEBLLM_CAPABILITIES
  private engine: webllm.WebWorkerMLCEngine | null = null
  private worker: Worker | null = null

  async load(model: ModelSpec, onProgress: (p: LoadProgress) => void): Promise<void> {
    await this.unload()
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.engine = await webllm.CreateWebWorkerMLCEngine(this.worker, model.runtimeModelId, {
      initProgressCallback: (r) => {
        const text = r.text ?? ''
        const stage: LoadProgress['stage'] = /compil|fetch.*wasm|shader/i.test(text)
          ? 'compiling'
          : 'downloading'
        onProgress({ stage, fraction: r.progress ?? 0, detail: text.slice(0, 80) })
      },
      logLevel: 'WARN',
    })
    onProgress({ stage: 'ready', fraction: 1, detail: 'ready' })
  }

  async unload(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.unload()
      } catch {
        /* worker teardown anyway */
      }
    }
    this.worker?.terminate()
    this.engine = null
    this.worker = null
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!this.engine) throw new Error('backend not loaded')
    const t0 = performance.now()
    let firstTokenAt = -1
    let text = ''
    let index = 0
    let promptTokens: number | undefined

    const onAbort = () => {
      void Promise.resolve(this.engine?.interruptGenerate()).catch(() => undefined)
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const stream = await this.engine.chat.completions.create({
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        logprobs: true,
        top_logprobs: this.capabilities.maxTopLogprobs,
        temperature: req.sampling.temperature,
        top_p: req.sampling.topP,
        max_tokens: req.sampling.maxTokens,
        seed: req.sampling.seed,
        stream_options: { include_usage: true },
      })

      for await (const chunk of stream) {
        if (req.signal?.aborted) break
        const usage = chunk.usage as { prompt_tokens?: number } | undefined
        if (usage?.prompt_tokens != null) promptTokens = usage.prompt_tokens
        const choice = chunk.choices?.[0]
        if (!choice) continue
        const lp = choice.logprobs?.content?.[0]
        const deltaText = choice.delta?.content ?? ''
        if (!lp && !deltaText) continue
        if (firstTokenAt < 0) firstTokenAt = performance.now()

        let tokenText: string
        let prob = 0
        let top: TopKEntry[] = []
        if (lp) {
          tokenText = decodeToken(lp.token)
          prob = Math.exp(lp.logprob)
          top = (lp.top_logprobs ?? [])
            .map((t) => ({ text: decodeToken(t.token), prob: Math.exp(t.logprob) }))
            .sort((a, b) => b.prob - a.prob)
        } else {
          tokenText = deltaText
        }
        const ev: TokenEvent = { index: index++, text: tokenText, prob, top }
        req.onToken(ev)
        text += tokenText
      }
    } finally {
      req.signal?.removeEventListener('abort', onAbort)
    }

    const end = performance.now()
    const prefillMs = (firstTokenAt < 0 ? end : firstTokenAt) - t0
    const decodeMs = firstTokenAt < 0 ? 0 : end - firstTokenAt
    const n = index
    return {
      text,
      stats: {
        prefillMs,
        decodeMs,
        completionTokens: n,
        promptTokens,
        tokensPerSec: decodeMs > 0 ? n / (decodeMs / 1000) : 0,
      },
    }
  }
}
