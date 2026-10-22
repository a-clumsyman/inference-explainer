// Deterministic mock backend. Drives the full UI (token strip, timing bar,
// probability playback) without a GPU or a model download. Used for design
// review, headless verification, and as the fallback when WebGPU is missing.
import type {
  BackendCapabilities,
  GenerateRequest,
  GenerateResult,
  LoadProgress,
  ModelBackend,
  ModelSpec,
  TokenEvent,
} from './types'

export const MOCK_CAPABILITIES: BackendCapabilities = {
  logprobs: 'full-vocab',
  maxTopLogprobs: 5,
  attention: false,
  hiddenStates: false,
  tokenizerAccess: true,
  runsWhere: 'browser-webgpu',
}

// A scripted reply with hand-tuned plausible top-5 distributions.
// [token, sampledProb, [alt1, p1], [alt2, p2], ...] - alts exclude the sampled one.
type Step = [string, number, ...[string, number][]]
const SCRIPT: Step[] = [
  ['When', 0.71, ['If', 0.12], ['Once', 0.06], ['After', 0.04], ['Before', 0.02]],
  [' your', 0.88, [' the', 0.05], [' a', 0.03], [' each', 0.02], [' this', 0.01]],
  [' prompt', 0.93, [' message', 0.03], [' text', 0.02], [' input', 0.01], [' question', 0.005]],
  [' arrives', 0.44, [' comes', 0.21], [' is', 0.12], [' gets', 0.08], [' reaches', 0.05]],
  [',', 0.81, [' it', 0.07], [' the', 0.04], [' I', 0.03], [' and', 0.02]],
  [' it', 0.77, [' I', 0.09], [' the', 0.06], [' we', 0.03], [' first', 0.02]],
  [' is', 0.69, [' gets', 0.14], [' has', 0.06], [' first', 0.04], [' will', 0.03]],
  [' split', 0.58, [' broken', 0.17], [' cut', 0.09], [' turned', 0.06], [' converted', 0.04]],
  [' into', 0.91, [' to', 0.04], [' in', 0.02], [' small', 0.01], [' tokens', 0.01]],
  [' tokens', 0.86, [' pieces', 0.06], [' chunks', 0.04], [' words', 0.02], [' units', 0.01]],
  [' -', 0.47, [' -', 0.31], [',', 0.08], [' and', 0.05], [' so', 0.03]],
  [' small', 0.72, [' little', 0.08], [' short', 0.07], [' sub', 0.05], [' the', 0.03]],
  [' pieces', 0.64, [' chunks', 0.14], [' fragments', 0.08], [' units', 0.07], [' parts', 0.05]],
  [' of', 0.9, [' that', 0.03], [' the', 0.03], [' a', 0.02], [' text', 0.01]],
  [' text', 0.82, [' your', 0.05], [' the', 0.04], [' language', 0.03], [' words', 0.02]],
  [' the', 0.74, [' that', 0.08], [' a', 0.06], [' my', 0.04], [' this', 0.03]],
  [' model', 0.89, [' system', 0.04], [' tokenizer', 0.03], [' network', 0.02], [' AI', 0.01]],
  [' has', 0.68, [' knows', 0.11], [' learned', 0.08], [' already', 0.05], [' keeps', 0.03]],
  [' seen', 0.61, [' learned', 0.16], [' stored', 0.08], [' memorized', 0.06], [' kept', 0.04]],
  [' many', 0.55, [' often', 0.14], [' during', 0.11], [' in', 0.08], [' before', 0.06]],
  [' times', 0.79, [' before', 0.09], [' during', 0.05], [' in', 0.03], [' over', 0.02]],
  [' before', 0.88, [' already', 0.05], [' earlier', 0.03], [' in', 0.02], [' previously', 0.01]],
  ['.', 0.94, ['\n\n', 0.03], [',', 0.01], [' and', 0.01], [' so', 0.005]],
  ['\n\n', 0.52, ['Each', 0.18], ['The', 0.12], ['Then', 0.08], ['Every', 0.05]],
  ['Each', 0.66, ['Every', 0.12], ['The', 0.09], ['These', 0.06], ['One', 0.04]],
  [' token', 0.84, [' piece', 0.06], [' one', 0.05], [' of', 0.03], [' chunk', 0.01]],
  [' becomes', 0.63, [' is', 0.14], [' turns', 0.09], [' gets', 0.07], [' then', 0.03]],
  [' a', 0.87, [' an', 0.06], [' the', 0.04], [' one', 0.02], [' this', 0.01]],
  [' list', 0.41, [' set', 0.19], [' long', 0.12], [' series', 0.1], [' vector', 0.08]],
  [' of', 0.92, [' that', 0.03], [' numbers', 0.02], [' the', 0.01], [' vectors', 0.01]],
  [' numbers', 0.78, [' vectors', 0.1], [' values', 0.06], [' digits', 0.03], [' IDs', 0.02]],
  [',', 0.69, [' and', 0.1], [' -', 0.08], [' called', 0.06], [' that', 0.04]],
  [' and', 0.58, [' then', 0.16], [' which', 0.09], [' that', 0.07], [' while', 0.05]],
  [' the', 0.81, [' those', 0.06], [' these', 0.05], [' a', 0.04], [' all', 0.03]],
  [' layers', 0.57, [' network', 0.16], [' model', 0.1], [' transformer', 0.08], [' stack', 0.05]],
  [' then', 0.49, [' each', 0.18], [' all', 0.11], [' work', 0.09], [' take', 0.07]],
  [' compare', 0.38, [' mix', 0.21], [' pass', 0.14], [' read', 0.1], [' transform', 0.08]],
  [' every', 0.52, [' each', 0.19], [' all', 0.11], [' those', 0.08], [' the', 0.06]],
  [' token', 0.71, [' of', 0.1], [' one', 0.08], [' number', 0.06], [' piece', 0.04]],
  [' with', 0.66, [' against', 0.12], [' to', 0.09], [' using', 0.07], [' by', 0.05]],
  [' every', 0.44, [' each', 0.21], [' all', 0.14], [' the', 0.1], [' one', 0.06]],
  [' earlier', 0.6, [' previous', 0.17], [' other', 0.11], [' token', 0.07], [' one', 0.04]],
  [' one', 0.68, [' token', 0.16], [' of', 0.08], [' before', 0.04], [' in', 0.03]],
  [',', 0.73, [' and', 0.09], [' so', 0.06], [' -', 0.05], [' which', 0.04]],
  [' so', 0.51, [' meaning', 0.17], [' which', 0.11], [' and', 0.09], [' that', 0.07]],
  [' the', 0.72, [' each', 0.09], [' every', 0.07], [' a', 0.06], [' this', 0.04]],
  [' word', 0.43, [' token', 0.31], [' piece', 0.11], [' model', 0.08], [' vector', 0.05]],
  [' can', 0.62, [' is', 0.14], [' may', 0.09], [' gets', 0.07], [' will', 0.05]],
  [' borrow', 0.29, [' gather', 0.21], [' pull', 0.16], [' take', 0.13], [' pick', 0.1]],
  [' meaning', 0.48, [' context', 0.24], [' information', 0.12], [' hints', 0.08], [' signal', 0.05]],
  [' from', 0.83, [' of', 0.06], [' the', 0.05], [' all', 0.03], [' earlier', 0.02]],
  [' its', 0.59, [' the', 0.17], [' all', 0.09], [' each', 0.08], [' earlier', 0.05]],
  [' neighbors', 0.54, [' context', 0.19], [' surroundings', 0.1], [' sentence', 0.08], [' neighbours', 0.06]],
  ['.', 0.91, ['\n\n', 0.04], [',', 0.02], [' and', 0.02], [' so', 0.01]],
  ['\n\n', 0.48, ['Finally', 0.19], ['At', 0.13], ['The', 0.1], ['After', 0.06]],
  ['At', 0.44, ['In', 0.2], ['The', 0.15], ['After', 0.11], ['Finally', 0.07]],
  [' the', 0.86, [' each', 0.05], [' every', 0.04], [' this', 0.03], [' that', 0.01]],
  [' end', 0.67, [' top', 0.12], [' output', 0.09], [' last', 0.07], [' final', 0.04]],
  [',', 0.64, [' the', 0.12], [' of', 0.09], [' layer', 0.07], [' it', 0.05]],
  [' the', 0.79, [' a', 0.08], [' this', 0.06], [' one', 0.04], [' that', 0.02]],
  [' model', 0.81, [' network', 0.07], [' system', 0.05], [' last', 0.04], [' transformer', 0.02]],
  [' scores', 0.46, [' ranks', 0.19], [' rates', 0.12], [' compares', 0.1], [' weighs', 0.08]],
  [' every', 0.58, [' each', 0.17], [' all', 0.11], [' the', 0.08], [' possible', 0.05]],
  [' word', 0.49, [' token', 0.29], [' possible', 0.09], [' piece', 0.07], [' option', 0.05]],
  [' it', 0.7, [' in', 0.11], [' that', 0.08], [' the', 0.06], [' we', 0.03]],
  [' knows', 0.55, [' has', 0.16], [' could', 0.1], [' can', 0.09], [' might', 0.06]],
  [' for', 0.74, [' as', 0.09], [' to', 0.07], [' against', 0.05], [' on', 0.04]],
  [' how', 0.57, [' by', 0.15], [' on', 0.11], [' for', 0.09], [' and', 0.06]],
  [' well', 0.52, [' likely', 0.2], [' much', 0.11], [' good', 0.08], [' closely', 0.06]],
  [' each', 0.6, [' it', 0.13], [' one', 0.1], [' they', 0.08], [' would', 0.06]],
  [' fits', 0.5, [' would', 0.16], [' could', 0.12], [' continues', 0.1], [' might', 0.08]],
  [' as', 0.55, [' to', 0.15], [' for', 0.11], [' in', 0.1], [' being', 0.06]],
  [' the', 0.84, [' a', 0.06], [' your', 0.05], [' this', 0.03], [' that', 0.02]],
  [' next', 0.88, [' following', 0.05], [' very', 0.03], [' single', 0.02], [' one', 0.01]],
  [' word', 0.53, [' token', 0.3], [' piece', 0.08], [' one', 0.05], [' chunk', 0.03]],
  ['.', 0.93, ['\n\n', 0.03], [' and', 0.02], [' then', 0.01], [',', 0.01]],
  ['\n\n', 0.41, ['The', 0.22], ['Then', 0.15], ['A', 0.1], ['It', 0.08]],
  ['A', 0.47, ['The', 0.19], ['One', 0.12], ['Then', 0.1], ['It', 0.08]],
  [' single', 0.63, [' one', 0.14], [' token', 0.09], [' final', 0.07], [' small', 0.05]],
  [' token', 0.72, [' word', 0.12], [' one', 0.08], [' piece', 0.05], [' number', 0.02]],
  [' is', 0.76, [' gets', 0.09], [' then', 0.06], [' will', 0.05], [' has', 0.03]],
  [' sampled', 0.44, [' picked', 0.23], [' chosen', 0.15], [' drawn', 0.09], [' selected', 0.07]],
  [' from', 0.8, [' of', 0.07], [' those', 0.05], [' that', 0.04], [' the', 0.03]],
  [' those', 0.58, [' these', 0.14], [' the', 0.12], [' all', 0.08], [' this', 0.06]],
  [' scores', 0.51, [' numbers', 0.17], [' weights', 0.12], [' values', 0.1], [' odds', 0.08]],
  [' -', 0.42, [' and', 0.21], [', then', 0.14], [' before', 0.11], [' so', 0.08]],
  [' your', 0.64, [' the', 0.14], [' my', 0.08], [' this', 0.07], [' that', 0.05]],
  [' temperature', 0.71, [' sampling', 0.12], [' slider', 0.07], [' settings', 0.05], [' controls', 0.04]],
  [' decides', 0.39, [' controls', 0.21], [' sets', 0.14], [' shapes', 0.11], [' governs', 0.09]],
  [' how', 0.68, [' the', 0.1], [' much', 0.09], [' wild', 0.07], [' far', 0.05]],
  [' wild', 0.35, [' random', 0.24], [' bold', 0.13], [' safe', 0.11], [' adventurous', 0.09]],
  [' that', 0.58, [' the', 0.16], [' this', 0.1], [' each', 0.08], [' a', 0.06]],
  [' choice', 0.54, [' pick', 0.17], [' step', 0.11], [' sample', 0.09], [' token', 0.07]],
  [' is', 0.74, [' feels', 0.08], [' gets', 0.07], [' will', 0.06], [' can', 0.04]],
  [',', 0.7, [' and', 0.1], [' so', 0.08], [' before', 0.06], [' then', 0.05]],
  [' gets', 0.42, [' is', 0.22], [' then', 0.13], [' becomes', 0.11], [' will', 0.08]],
  [' appended', 0.51, [' added', 0.2], [' attached', 0.12], [' written', 0.09], [' joined', 0.06]],
  [' to', 0.82, [' onto', 0.07], [' the', 0.05], [' your', 0.03], [' in', 0.02]],
  [' the', 0.77, [' your', 0.08], [' this', 0.07], [' our', 0.04], [' that', 0.03]],
  [' prompt', 0.59, [' text', 0.14], [' conversation', 0.11], [' message', 0.08], [' context', 0.06]],
  [',', 0.67, [' and', 0.11], [' so', 0.08], [' then', 0.07], [' -', 0.05]],
  [' and', 0.71, [' then', 0.11], [' so', 0.08], [' the', 0.05], [' which', 0.04]],
  [' the', 0.73, [' this', 0.09], [' a', 0.07], [' every', 0.06], [' that', 0.04]],
  [' whole', 0.49, [' entire', 0.18], [' full', 0.13], [' same', 0.1], [' process', 0.08]],
  [' loop', 0.44, [' cycle', 0.21], [' process', 0.16], [' thing', 0.1], [' dance', 0.07]],
  [' repeats', 0.57, [' runs', 0.15], [' starts', 0.11], [' begins', 0.09], [' continues', 0.06]],
  [' for', 0.63, [' to', 0.12], [' until', 0.09], [' with', 0.08], [' over', 0.06]],
  [' the', 0.68, [' each', 0.1], [' every', 0.09], [' this', 0.07], [' that', 0.05]],
  [' next', 0.74, [' following', 0.09], [' very', 0.07], [' new', 0.05], [' coming', 0.04]],
  [' token', 0.79, [' word', 0.09], [' one', 0.06], [' piece', 0.04], [' step', 0.02]],
  ['.', 0.95, ['\n', 0.02], [' and', 0.01], [' so', 0.01], [',', 0.005]],
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MockBackend implements ModelBackend {
  readonly id = 'mock'
  readonly capabilities = MOCK_CAPABILITIES
  private loaded = false

  async load(_model: ModelSpec, onProgress: (p: LoadProgress) => void): Promise<void> {
    const stages: [LoadProgress['stage'], string][] = [
      ['downloading', 'weights shard 1/4'],
      ['downloading', 'weights shard 2/4'],
      ['downloading', 'weights shard 3/4'],
      ['downloading', 'weights shard 4/4'],
      ['compiling', 'compiling WebGPU kernels'],
    ]
    for (let i = 0; i < stages.length; i++) {
      onProgress({ stage: stages[i][0], fraction: (i + 1) / (stages.length + 1), detail: stages[i][1] })
      await sleep(140)
    }
    onProgress({ stage: 'ready', fraction: 1, detail: 'ready' })
    this.loaded = true
  }

  async unload(): Promise<void> {
    this.loaded = false
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!this.loaded) throw new Error('mock backend not loaded')
    const last = req.messages.filter((m) => m.role === 'user').pop()?.content ?? ''
    const promptTokens = simpleTokenize(last)

    const t0 = performance.now()
    // fake prefill proportional to prompt length
    await sleep(120 + promptTokens.length * 8)

    let first = -1
    let text = ''
    for (let i = 0; i < SCRIPT.length; i++) {
      if (req.signal?.aborted) break
      const [tok, prob, ...alts] = SCRIPT[i]
      const ev: TokenEvent = {
        index: i,
        text: tok,
        prob,
        top: [{ text: tok, prob }, ...alts.map(([t, p]) => ({ text: t, prob: p }))].sort(
          (a, b) => b.prob - a.prob,
        ),
      }
      if (first < 0) first = performance.now()
      req.onToken(ev)
      text += tok
      await sleep(28)
    }
    const end = performance.now()
    const prefillMs = first - t0
    const decodeMs = end - (first < 0 ? t0 : first)
    const n = SCRIPT.length
    return {
      text,
      promptTokens,
      stats: {
        prefillMs,
        decodeMs,
        completionTokens: n,
        promptTokens: promptTokens.length,
        tokensPerSec: n / (decodeMs / 1000),
      },
    }
  }
}

/** Whitespace-aware pseudo-tokenizer for the mock path only. */
export function simpleTokenize(s: string): string[] {
  const out: string[] = []
  const re = /(\s+|[^\s\w]+|\w+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) out.push(m[0])
  return out
}
