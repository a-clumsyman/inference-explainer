// ---------------------------------------------------------------------------
// Model backend abstraction.
//
// Every model the app can run sits behind ModelBackend. What the UI is allowed
// to SHOW for a model is decided entirely by `capabilities`, never by model id.
// That is the seam for frontier API models: an OpenAI-compatible backend can be
// added later (GPT / Claude-via-adapter / Gemini / OpenRouter) returning
// capabilities = { logprobs: 'top20', attention: false, ... } and the UI will
// automatically render it as "showcase mode - limited internals" without any
// component changes. See README.md "The frontier seam".
// ---------------------------------------------------------------------------

export type LogprobDepth = 'full-vocab' | 'top20' | 'none'

export interface BackendCapabilities {
  /** How much of the next-token distribution this backend can report. */
  logprobs: LogprobDepth
  /** Max alternatives per token position the backend can return. */
  maxTopLogprobs: number
  attention: boolean
  hiddenStates: boolean
  /** Can report the model's own tokenization of arbitrary text. */
  tokenizerAccess: boolean
  runsWhere: 'browser-webgpu' | 'server-selfhosted' | 'api'
}

export interface ModelSpec {
  /** Catalog key, unique across backends. */
  id: string
  backendId: string
  /** Backend-native model identifier (e.g. MLC model id). */
  runtimeModelId: string
  label: string
  family: string
  paramsB: number
  quant: string
  /** Approximate weights download in MB. */
  weightsMB: number
  contextTokens: number
  /** Estimated runtime memory in MB (weights + KV cache + scratch). */
  vramMB: number
  /** One-line personality note, shown on the spec card. */
  note: string
  /** When true the entry is a catalog placeholder, not yet loadable. */
  comingSoon?: boolean
}

export interface SamplingParams {
  temperature: number
  topP: number
  /** 0 = off. Only engines with native top_k honor this (see BackendCapabilities). */
  topK: number
  maxTokens: number
  seed?: number
}

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface TopKEntry {
  text: string
  /** Probability 0..1 after softmax. */
  prob: number
}

export interface TokenEvent {
  /** Token index within this reply, 0-based. */
  index: number
  text: string
  prob: number
  top: TopKEntry[]
}

export interface GenerationStats {
  /** ms from submit to first token (prefill). */
  prefillMs: number
  /** ms from first token to last token (decode). */
  decodeMs: number
  completionTokens: number
  promptTokens?: number
  tokensPerSec: number
}

export interface GenerateRequest {
  messages: ChatTurn[]
  sampling: SamplingParams
  onToken: (t: TokenEvent) => void
  signal?: AbortSignal
}

export interface GenerateResult {
  text: string
  stats: GenerationStats
  /** Model's own tokenization of the prompt, when the backend can produce it. */
  promptTokens?: string[]
}

export interface LoadProgress {
  stage: 'downloading' | 'compiling' | 'ready'
  /** 0..1 */
  fraction: number
  detail: string
}

export interface ModelBackend {
  readonly id: string
  readonly capabilities: BackendCapabilities
  load(model: ModelSpec, onProgress: (p: LoadProgress) => void): Promise<void>
  unload(): Promise<void>
  generate(req: GenerateRequest): Promise<GenerateResult>
}
