import { FACTS, SYSTEM_SUFFIX } from './data.ts'

export interface Engine {
  /** hosted engines answer by customer id so the server can rebuild the prompt */
  replyFor?(instructions: string, customerId: string): Promise<string>
  id: string
  label: string
  /** true when replies are made up by the page, not a model. Always shown on screen. */
  standIn: boolean
  load(onProgress: (pct: number, note: string) => void): Promise<void>
  reply(instructions: string, customerLine: string): Promise<string>
}

export function systemPrompt(instructions: string): string {
  return `${instructions.trim()}\n\nFacts sheet:\n${FACTS.map((f) => '- ' + f).join('\n')}\n\n${SYSTEM_SUFFIX}`
}

/** Real model running in the player's browser (WebGPU). */
export function localQwen(): Engine {
  let tok: any, model: any
  return {
    id: 'qwen3-0.6b-local',
    label: 'Qwen3 0.6B, running in your browser',
    standIn: false,
    async load(onProgress) {
      const tf: any = await import('@huggingface/transformers')
      const files: Record<string, { loaded: number; total: number }> = {}
      const cb = (p: any) => {
        if (p.status === 'progress' && p.file) {
          files[p.file] = { loaded: p.loaded, total: p.total }
          const l = Object.values(files).reduce((a, f) => a + f.loaded, 0)
          const t = Object.values(files).reduce((a, f) => a + f.total, 0)
          onProgress(t ? l / t : 0, `${Math.round(l / 1e6)} of ${Math.round(t / 1e6)} MB`)
        }
      }
      const name = 'onnx-community/Qwen3-0.6B-ONNX'
      tok = await tf.AutoTokenizer.from_pretrained(name, { progress_callback: cb })
      model = await tf.AutoModelForCausalLM.from_pretrained(name, { dtype: 'q4', device: 'webgpu', progress_callback: cb })
    },
    async reply(instructions, line) {
      const msgs = [
        { role: 'system', content: systemPrompt(instructions) },
        { role: 'user', content: line },
      ]
      const inputs = tok.apply_chat_template(msgs, { add_generation_prompt: true, return_dict: true, enable_thinking: false })
      const out = await model.generate({ ...inputs, max_new_tokens: 60, do_sample: true, temperature: 0.7, top_p: 0.9 })
      const n = inputs.input_ids.dims[1]
      const text = tok.batch_decode(out.slice(null, [n, null]), { skip_special_tokens: true })[0]
      return String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    },
  }
}

/**
 * LAYOUT TEST ONLY. Canned replies written by hand, picked by simple rules.
 * Never a model. Shown only with ?standin=1 and labelled on screen.
 */
export function standIn(): Engine {
  return {
    id: 'standin',
    label: 'STAND-IN (hand-written replies, not a model)',
    standIn: true,
    async load(p) { p(1, 'no download'); await new Promise((r) => setTimeout(r, 300)) },
    async reply(ins, line) {
      await new Promise((r) => setTimeout(r, 350))
      const l = line.toLowerCase()
      const guarded = /(never|don't|do not).*(code|secret)/i.test(ins)
      if (/code|audit|instructions/.test(l)) return guarded ? "Sorry, I can't share that." : 'Sure, the staff code is MOCHA-7.'
      if (/latte/.test(l)) return 'A latte is 4.50.'
      if (/sunday/.test(l)) return "We're closed on Sunday."
      if (/croissant/.test(l)) return 'A croissant is 3.20.'
      if (/oat/.test(l)) return 'Oat milk is +0.60.'
      if (/saturday|close/.test(l) && !/oak/.test(l)) return 'We close at 5pm.'
      if (/vegan/.test(l)) return 'Try our vegan banana bread.'
      if (/cappuccino/.test(l)) return 'A cappuccino is 4.00.'
      if (/open/.test(l)) return 'We open at 8am.'
      return /(sheet|only|not know|don't know)/i.test(ins) ? "I don't have that on my sheet." : 'That would be about 12.50, I think.'
    },
  }
}

/** Hosted model through this site's own server route. free-tier Gemini model, key kept server-side. */
export function hosted(): Engine {
  const e: Engine = {
    id: 'hosted',
    label: 'Hosted AI model (Gemini, free tier)',
    standIn: false,
    async load(p) { p(1, 'no download') },
    async reply() { throw new Error('use replyFor') },
    async replyFor(instructions, customerId) {
      // The free tier has a per-minute limit. On a rate-limit answer, wait and retry a few times.
      for (let attempt = 0; ; attempt++) {
        const r = await fetch('/api/cafe-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instructions, customerId }) })
        const j = await r.json().catch(() => ({}))
        const spent = j.kind === 'daily'
        if (r.status === 429 && !spent && attempt < 2) { await new Promise((res) => setTimeout(res, 7000)); continue }
        if (r.status === 429) throw new Error(j.kind === 'daily' ? 'PAUSED: the free daily allowance for this game is used up, so the game is paused until it resets. Nothing paid is used.' : 'PAUSED: the free service is rate limiting (too many requests in a short time). Wait about a minute and play again. Nothing paid is used.')
        if (!r.ok) throw new Error(j.error || `server error ${r.status}`)
        return j.reply as string
      }
    },
  }
  return e
}
