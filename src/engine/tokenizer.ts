// Real per-model prompt tokenization, in-browser, via the model's own HF
// tokenizer (transformers.js AutoTokenizer). This is what web-llm does not
// expose; loading the tokenizer directly is the truthful fix, not an
// approximation. Tokenizer files are a few MB from the HF hub and get cached
// by transformers.js in the browser.
import type { ModelSpec } from './types'

// Lazy-loaded: the tokenizer runtime stays out of the initial bundle.
type PreTrainedTokenizer = Awaited<
  ReturnType<(typeof import('@huggingface/transformers'))['AutoTokenizer']['from_pretrained']>
>

/** Catalog model -> HF repo whose tokenizer matches the deployed weights. */
const TOKENIZER_REPO: Record<string, string> = {
  'qwen3-0.6b': 'Qwen/Qwen3-0.6B',
  'qwen3-1.7b': 'Qwen/Qwen3-1.7B',
  'qwen3-4b': 'Qwen/Qwen3-4B',
  'smollm2-360m': 'HuggingFaceTB/SmolLM2-360M-Instruct',
  'llama32-1b': 'onnx-community/Llama-3.2-1B-Instruct',
}

const cache = new Map<string, Promise<PreTrainedTokenizer>>()

function load(repo: string): Promise<PreTrainedTokenizer> {
  let p = cache.get(repo)
  if (!p) {
    p = import('@huggingface/transformers').then((m) =>
      m.AutoTokenizer.from_pretrained(repo),
    ) as Promise<PreTrainedTokenizer>
    cache.set(repo, p)
  }
  return p
}

/**
 * Tokenize text with the model's own tokenizer. Returns one string per token
 * (byte-level spellings decoded to readable text). Throws if the model has no
 * tokenizer mapping - callers should treat that as "unknown", not fake it.
 */
export async function promptTokensFor(model: ModelSpec, text: string): Promise<string[]> {
  const repo = TOKENIZER_REPO[model.id]
  if (!repo) throw new Error(`no tokenizer mapping for ${model.id}`)
  const tok = await load(repo)
  const ids = tok.encode(text)
  const out: string[] = []
  for (const id of ids) {
    let piece = tok.decode([id])
    // skip BOS/EOS control tokens from display; mark them instead
    if (/^<(s|\/s|im_start|im_end|begin_of_text|end_of_text)>$/.test(piece)) continue
    out.push(piece)
  }
  return out
}

export function hasTokenizerMapping(model: ModelSpec): boolean {
  return model.id in TOKENIZER_REPO
}
