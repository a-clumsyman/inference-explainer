// Deep engine: open models via transformers.js (ONNX, WebGPU).
// Slower than web-llm's precompiled kernels, but exposes what the fast engine
// cannot: NATIVE top_k sampling, full-vocab per-step scores, and the model's
// own tokenizer. This is the runtime path that makes top_k truthful - the
// constraint is applied inside the sampling loop by the engine, not faked
// client-side.
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

export const TJS_CAPABILITIES: BackendCapabilities = {
  logprobs: 'full-vocab',
  maxTopLogprobs: 32,
  attention: false, // v2: output_attentions
  hiddenStates: false,
  tokenizerAccess: true,
  runsWhere: 'browser-webgpu',
}

/** Catalog model -> ONNX repo for the deep engine. */
const ONNX_REPO: Record<string, string> = {
  'qwen3-0.6b': 'onnx-community/Qwen3-0.6B-ONNX',
  'qwen3-1.7b': 'onnx-community/Qwen3-1.7B-ONNX',
  'qwen3-4b': 'onnx-community/Qwen3-4B-ONNX',
}

export function hasDeepEngine(model: ModelSpec): boolean {
  return model.id in ONNX_REPO
}

type AnyModel = {
  generate: (args: Record<string, unknown>) => Promise<{
    sequences: { slice: (a: [number, null]) => { tolist: () => number[][] } }
    scores: Array<{ data: Float32Array; dims: number[] }>
  }>
}
type AnyTokenizer = {
  apply_chat_template: (msgs: unknown, opts: Record<string, unknown>) => string
  (text: string): Record<string, unknown>
  decode: (ids: number[]) => string
  encode: (text: string) => number[]
}

function topK(probs: Float32Array, k: number): TopKEntry[] {
  // partial selection of the k largest
  const idx = new Uint32Array(probs.length)
  for (let i = 0; i < probs.length; i++) idx[i] = i
  const arr = Array.from(idx)
  arr.sort((a, b) => probs[b] - probs[a])
  return arr.slice(0, k).map((i) => ({ text: '', prob: probs[i], _id: i }) as TopKEntry & { _id: number })
}

export class TransformersJSBackend implements ModelBackend {
  readonly id = 'transformersjs'
  readonly capabilities = TJS_CAPABILITIES
  private model: AnyModel | null = null
  private tokenizer: AnyTokenizer | null = null
  private aborted = false

  async load(spec: ModelSpec, onProgress: (p: LoadProgress) => void): Promise<void> {
    const repo = ONNX_REPO[spec.id]
    if (!repo) throw new Error(`deep engine has no ONNX build for ${spec.label} yet`)
    const t = await import('@huggingface/transformers')
    onProgress({ stage: 'downloading', fraction: 0.02, detail: 'tokenizer' })
    this.tokenizer = (await t.AutoTokenizer.from_pretrained(repo)) as unknown as AnyTokenizer
    this.model = (await t.AutoModelForCausalLM.from_pretrained(repo, {
      dtype: 'q4',
      device: 'webgpu',
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === 'progress' && p.progress != null)
          onProgress({
            stage: 'downloading',
            fraction: Math.min(0.98, p.progress / 100),
            detail: p.file ?? 'weights',
          })
      },
    })) as unknown as AnyModel
    onProgress({ stage: 'ready', fraction: 1, detail: 'ready' })
  }

  async unload(): Promise<void> {
    this.model = null
    this.tokenizer = null
  }

  interrupt() {
    this.aborted = true
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!this.model || !this.tokenizer) throw new Error('deep engine not loaded')
    this.aborted = false
    const tok = this.tokenizer
    const t0 = performance.now()

    const text = tok.apply_chat_template(req.messages, {
      tokenize: false,
      add_generation_prompt: true,
    })
    const promptIds = tok.encode(text)
    const promptDisplay = promptIds
      .map((id) => tok.decode([id]))
      .filter((p) => !/^<[^>]+>$/.test(p))
    const inputs = tok(text)

    const { InterruptableStoppingCriteria } = await import('@huggingface/transformers')
    const stopping = new InterruptableStoppingCriteria()
    const self = this
    req.signal?.addEventListener('abort', () => {
      self.aborted = true
      stopping.interrupt()
    }, { once: true })

    const prefillEnd = performance.now() // generate() below includes prefill+decode; we time first-token via callback
    let firstTokenAt = -1
    const out = await this.model.generate({
      ...inputs,
      max_new_tokens: req.sampling.maxTokens,
      do_sample: req.sampling.temperature > 0,
      temperature: req.sampling.temperature > 0 ? req.sampling.temperature : undefined,
      top_p: req.sampling.topP < 1 ? req.sampling.topP : undefined,
      top_k: req.sampling.topK && req.sampling.topK > 0 ? req.sampling.topK : undefined,
      output_scores: true,
      return_dict_in_generate: true,
      stopping_criteria: stopping,
      callback_function: () => {
        if (firstTokenAt < 0) firstTokenAt = performance.now()
      },
    })
    const end = performance.now()

    const newIds = out.sequences.slice([promptIds.length, null]).tolist()[0]
    const scores = out.scores
    const n = Math.min(newIds.length, scores.length)
    const events: TokenEvent[] = []
    for (let i = 0; i < n; i++) {
      const logits = scores[i].data
      // softmax
      let max = -Infinity
      for (let j = 0; j < logits.length; j++) if (logits[j] > max) max = logits[j]
      let sum = 0
      const probs = new Float32Array(logits.length)
      for (let j = 0; j < logits.length; j++) {
        probs[j] = Math.exp(logits[j] - max)
        sum += probs[j]
      }
      for (let j = 0; j < logits.length; j++) probs[j] /= sum
      const top = topK(probs, this.capabilities.maxTopLogprobs).map((e) => ({
        text: tok.decode([(e as TopKEntry & { _id: number })._id]),
        prob: e.prob,
      }))
      const id = newIds[i]
      const tokText = tok.decode([id])
      const sampled = top.find((e) => e.text === tokText)
      events.push({ index: i, text: tokText, prob: sampled?.prob ?? 0, top })
    }
    // replay so the UI streams the steps (the pass itself already happened)
    for (const ev of events) {
      if (this.aborted) break
      req.onToken(ev)
      await new Promise((r) => setTimeout(r, 14))
    }

    const prefillMs = (firstTokenAt < 0 ? prefillEnd : firstTokenAt) - t0
    const decodeMs = firstTokenAt < 0 ? end - t0 : end - firstTokenAt
    return {
      text: events.map((e) => e.text).join(''),
      promptTokens: promptDisplay,
      stats: {
        prefillMs,
        decodeMs,
        completionTokens: n,
        promptTokens: promptIds.length,
        tokensPerSec: decodeMs > 0 ? n / (decodeMs / 1000) : 0,
      },
    }
  }
}
