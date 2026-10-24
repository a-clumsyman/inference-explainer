# INFERENCE, OBSERVED

A chat window bolted onto the side of the machine. Every reply is annotated
with the tokenization, timing, and next-token odds that produced it - live,
from a model running in your browser.

## What it shows

- **Reply-as-tokenization.** The assistant's reply is rendered as its own
  tokens, one clickable span per generation step.
- **Confidence trace.** Per-step probability of the sampled token, drawn as an
  oscilloscope strip. Ink = the model was sure; vermilion = it was guessing.
- **What else it considered.** Click any token for the top-5 candidate tokens
  at that step and their probabilities; the sampled one is marked.
- **Prefill vs decode timing.** Why the first token is slow and the rest stream.
- **Re-roll.** Re-sample the same reply; tokens that changed are marked
  (dotted underline in the text, hatched bars in the trace).
- **Prompt tokenization, per model.** Each entry shows your prompt cut into
  tokens by the selected model's OWN tokenizer (loaded in-browser via
  transformers.js AutoTokenizer from the model's HF repo - not an estimate).
- **Two engines.** "fast" = web-llm precompiled WebGPU kernels (top-5 odds per
  step). "deep" = transformers.js ONNX WebGPU: native top_k sampling and
  full-vocab per-step scores (top-32 shown). The deep engine runs the full
  pass, then replays it step by step.
- **top_k, done honestly.** The fast engine's API cannot apply top_k, so the
  slider is disabled there with a note. On the deep engine top_k is applied
  inside the sampling loop by the engine itself.
- **Model switching.** Several open models (Qwen3 0.6B-4B, SmolLM2 360M,
  Llama 3.2 1B) with spec cards. Each entry records which model and sampling
  settings produced it.

## Stack

Vite + React + TypeScript, Tailwind v4 (theme is hand-rolled CSS variables in
`src/index.css`), [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) in a web
worker. Static build, zero backend, zero cost. Model weights download once
from Hugging Face CDN and are cached in the browser (IndexedDB/CacheStorage).

Requires WebGPU (desktop Chrome/Edge today). Without WebGPU the app offers a
"demo data" mode running a scripted mock engine so the UI is still explorable.

## The frontier seam (how API models plug in later)

Everything the UI can show about a model is decided by one interface:
`src/engine/types.ts` -> `ModelBackend` + `BackendCapabilities`.

```
logprobs:       'full-vocab' | 'top20' | 'none'
maxTopLogprobs: number
attention:      boolean
hiddenStates:   boolean
tokenizerAccess: boolean
runsWhere:      'browser-webgpu' | 'server-selfhosted' | 'api'
```

Two backends exist today:

- `WebLLMBackend` (`src/engine/webllm.ts`) - open models in-browser. Full-vocab
  logprobs (top-5 displayed), real timings, weights cached locally.
- `MockBackend` (`src/engine/mock.ts`) - scripted demo data, same interface.

**Frontier showcase mode (not built yet):** add an `OpenAICompatibleBackend`
implementing `ModelBackend` against any OpenAI-compatible endpoint (OpenAI,
OpenRouter free tier, Gemini's OpenAI-compatible endpoint, Claude via an
adapter). Its capabilities would be:

```
logprobs: 'top20', maxTopLogprobs: 20, attention: false,
hiddenStates: false, tokenizerAccess: false, runsWhere: 'api'
```

The catalog entries already exist (`gpt-frontier`, `gemini-frontier` in
`src/engine/catalog.ts`, marked `comingSoon`). When the backend lands, they
flip to loadable and the UI automatically renders them as showcase mode:
confidence trace capped at the API's top-20 window, no attention claims, an
"API - limited internals" badge. No component changes needed - that is the
point of the seam. The API key stays user-supplied (their own key, stored
locally), keeping hosting at $0.

## Known limits (honest list)

- **The deep engine is code-complete but unverified on real GPU hardware** at
  build time (the build sandbox has no WebGPU adapter; CPU generation was
  OOM-killed). It needs a first run on a real desktop GPU before release.
- **Deep engine model coverage:** ONNX builds are wired for Qwen3 0.6/1.7/4B
  only; SmolLM2 and Llama cards are marked "fast engine only" in deep mode.
- **Fast engine prompt tokens vs reply tokens:** prompt strip comes from the
  model's HF tokenizer; reply tokens come from streamed logprobs. Both are the
  model's own vocabulary.
- **Quantized logits.** q4 weights shift logits slightly vs fp16. The odds
  shown are the true odds of the deployed (quantized) model.
- **Re-roll re-samples the whole reply**, not just the clicked step. True
  per-step resampling needs the completions API with a hand-rendered chat
  template - v2.
- **Small models chat worse than API models.** That is the trade for seeing
  inside. The spec cards set that expectation.
- **Mobile browsers**: WebGPU support is weak; demo mode is the fallback.

## v2 seams (designed for, not built)

- Compare mode: same prompt, two models side by side (the store keeps
  per-entry model + settings already).
- Attention heatmap via a transformers.js sidecar model.
- KV cache meter (top bar already shows context usage).
- True per-step re-roll via `completions.create`.

## Develop

```bash
npm i
npm run dev     # dev server
npm run build   # static build into dist/
```


### Cafe preview model test (October 24, 2026)

The active counter and coach default is `gemini-3.5-flash-lite`, restored at the owner's request. No automatic model fallback is enabled. All checker, one-call coach evidence, current-state and pacing fixes are retained.

A bounded experiment with `gemini-3.6-flash` and medium thinking correctly calculated banana bread + cappuccino + oat milk as 8.40, admitted unknown Oak Street branch information, and completed the eight-case Day 2 matrix 8/8. Its free daily quota then exhausted; the Day 1 rerun and coach verification did not complete. The app clearly paused, preserved completed customers, and used nothing paid. Exact project quotas were not verified because AI Studio required sign-in. Published free pricing does not establish project RPM/TPM/RPD.

`gemini-3.8-flash` was listed but returned high-demand 503s and a bounded timeout; `gemini-2.5-pro` was listed but returned 404 unavailable to new users. `gemini-3.7-flash` is a deprecated alias to 3.8. No paid-only model was tried. A future explicit model option needs owner approval and fresh quota/pricing checks.

Sources: https://ai.google.dev/gemini-api/docs/pricing , https://ai.google.dev/gemini-api/docs/rate-limits , https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash , https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash .
