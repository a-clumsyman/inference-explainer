import type { ModelSpec } from './types'

// The catalog is deliberately flat: open in-browser models first (full
// internals), then frontier API placeholders (showcase mode, limited
// internals). Order is display order in the rail.
export const CATALOG: ModelSpec[] = [
  {
    id: 'qwen3-0.6b',
    backendId: 'webllm',
    runtimeModelId: 'Qwen3-0.6B-q4f16_1-MLC',
    label: 'Qwen3 0.6B',
    family: 'Qwen3',
    paramsB: 0.6,
    quant: 'q4f16',
    weightsMB: 430,
    contextTokens: 4096,
    vramMB: 1403,
    note: 'Fast and small. Raw enough that the machinery shows.',
  },
  {
    id: 'qwen3-1.7b',
    backendId: 'webllm',
    runtimeModelId: 'Qwen3-1.7B-q4f16_1-MLC',
    label: 'Qwen3 1.7B',
    family: 'Qwen3',
    paramsB: 1.7,
    quant: 'q4f16',
    weightsMB: 1100,
    contextTokens: 4096,
    vramMB: 2037,
    note: 'Steadier chat, still quick on a desktop GPU.',
  },
  {
    id: 'qwen3-4b',
    backendId: 'webllm',
    runtimeModelId: 'Qwen3-4B-q4f16_1-MLC',
    label: 'Qwen3 4B',
    family: 'Qwen3',
    paramsB: 4,
    quant: 'q4f16',
    weightsMB: 2500,
    contextTokens: 4096,
    vramMB: 3432,
    note: 'Best chat quality that still fits a laptop.',
  },
  {
    id: 'smollm2-360m',
    backendId: 'webllm',
    runtimeModelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    label: 'SmolLM2 360M',
    family: 'SmolLM2',
    paramsB: 0.36,
    quant: 'q4f16',
    weightsMB: 220,
    contextTokens: 4096,
    vramMB: 376,
    note: 'Tiny. Watch it guess, and see uncertainty up close.',
  },
  {
    id: 'llama32-1b',
    backendId: 'webllm',
    runtimeModelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 1B',
    family: 'Llama',
    paramsB: 1,
    quant: 'q4f16',
    weightsMB: 640,
    contextTokens: 4096,
    vramMB: 879,
    note: 'A different tokenizer - same words, different cuts.',
  },
  // -- Frontier showcase placeholders (not wired yet; the seam is the
  //    'openai-compatible' backend in types.ts). ------------------------------
  {
    id: 'gpt-frontier',
    backendId: 'openai-compatible',
    runtimeModelId: 'gpt-5-mini',
    label: 'GPT (API)',
    family: 'Frontier',
    paramsB: NaN,
    quant: 'api',
    weightsMB: 0,
    contextTokens: 128000,
    vramMB: 0,
    note: 'Showcase mode: text + top-20 logprobs only. No attention.',
    comingSoon: true,
  },
  {
    id: 'gemini-frontier',
    backendId: 'openai-compatible',
    runtimeModelId: 'gemini-3-flash',
    label: 'Gemini (API)',
    family: 'Frontier',
    paramsB: NaN,
    quant: 'api',
    weightsMB: 0,
    contextTokens: 1000000,
    vramMB: 0,
    note: 'Showcase mode: text + top-20 logprobs only. No attention.',
    comingSoon: true,
  },
]

export const DEFAULT_MODEL_ID = 'qwen3-0.6b'

export function modelById(id: string): ModelSpec {
  const m = CATALOG.find((x) => x.id === id)
  if (!m) throw new Error(`unknown model ${id}`)
  return m
}
