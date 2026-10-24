import { lessonCustomer, lessonFacts, type LessonStage } from './lessons.ts'
import { FACTS, SYSTEM_SUFFIX, CONTRACT, POOL } from './data.ts'

// When the game is iframed/served from clumsyman.xyz, the API lives on the origin that hosts the functions.
const API_BASE = typeof location !== 'undefined' && ['clumsyman.xyz', 'www.clumsyman.xyz'].includes(location.hostname) ? 'https://inference-explainer.vercel.app' : ''

export interface CafeState { stock: Record<string, number>; booked: Record<string, number> }

export interface Engine {
  /** hosted engines answer by customer id so the server can rebuild the prompt */
  replyFor?(instructions: string, customerId: string, escalate?: boolean, state?: CafeState): Promise<string>
  id: string
  label: string
  /** true when replies are made up by the page, not a model. Always shown on screen. */
  standIn: boolean
  load(onProgress: (pct: number, note: string) => void): Promise<void>
  reply(instructions: string, customerLine: string): Promise<string>
}

export function systemPrompt(instructions: string): string {
  return `${instructions.trim()}\n\nFacts sheet:\n${FACTS.map((f) => '- ' + f).join('\n')}\n\n${SYSTEM_SUFFIX}\n\n${CONTRACT}`
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
      // layout-test only: ?silent=1 makes the stand-in forget the ACTION line, so failure screens can be checked
      if (new URLSearchParams(location.search).get('silent') === '1') return 'Sure, coming right up!'
      const l = line.toLowerCase()
      const cu = POOL.find((p) => p.line === line)
      if (cu && cu.req.t === 'order') {
        if (cu.impossible) return "Sorry, we can't do that one.\nACTION: NONE"
        if (cu.id === 'r3') return 'One latte with oat milk coming right up!\nACTION: ORDER latte x1'
        return 'Coming up!\nACTION: ORDER ' + cu.req.items.map((i) => `${i.name} x${i.qty}`).join(', ')
      }
      if (cu && cu.req.t === 'book') return cu.impossible ? "Sorry, we can't seat that.\nACTION: NONE" : `Booked for you.\nACTION: BOOK ${cu.req.n} at ${cu.req.time}`
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
    async replyFor(instructions, customerId, escalate, state) {
      // The free tier has a per-minute limit. On a rate-limit answer, wait and retry a few times.
      for (let attempt = 0; ; attempt++) {
        const r = await fetch(API_BASE + '/api/cafe-reply', { signal: AbortSignal.timeout(65000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instructions, customerId, escalate: escalate === true, state }) })
        const j = await r.json().catch(() => ({}))
        const spent = j.kind === 'daily'
        if (r.status === 429 && !spent && attempt < 2) { await new Promise((res) => setTimeout(res, 7000)); continue }
        if (r.status === 429) throw new Error(j.kind === 'daily' ? 'PAUSED: the free daily allowance for this game is used up, so the game is paused until it resets. Nothing paid is used.' : 'PAUSED: the free service is rate limiting (too many requests in a short time). Wait about a minute and play again. Nothing paid is used.')
        if (!r.ok) throw new Error(j.error || `server error ${r.status}`)
        if (typeof j.reply !== 'string' || !j.reply.trim()) throw new Error('The AI returned no usable reply. The shift is saved; resume to retry this customer.')
        return j.reply as string
      }
    },
  }
  return e
}

/** Finite curriculum context; the server derives customer text and facts itself. */
export async function lessonReply(engine:Engine,instructions:string,day:number,stage:LessonStage,continued=false):Promise<string>{
 const c=lessonCustomer(day,stage,continued)
 if(engine.standIn){
  if(day===2&&!continued)return 'Which drink would you like?\nACTION: NONE'
  if(day===6&&!continued)return /approv|permission|confirm/i.test(instructions)?'May I book that table?\nACTION: NONE':'Booked!\nACTION: BOOK 3 at 15:00'
  if(day===1)return stage==='fresh'?'We close at 4pm today.\nACTION: NONE':'We open at 9am today.\nACTION: NONE'
  const reply=c.req.t==='order'?('Coming up!\nACTION: ORDER '+c.req.items.map(i=>`${i.name} x${i.qty}`).join(', ')):c.req.t==='book'?`Booked.\nACTION: BOOK ${c.req.n} at ${c.req.time}`:await engine.reply(instructions,c.line)
  return (day===0||day===4)&&/name/i.test(instructions)?`${stage==='fresh'?'Noor':'Mira'}, ${reply}`:reply
 }
 if(engine.id!=='hosted')return engine.reply(instructions+`\n\nLesson facts: ${lessonFacts(day,stage).join(' ')}`,c.line)
 for(let attempt=0;;attempt++){
  const r=await fetch(API_BASE+'/api/cafe-reply',{signal:AbortSignal.timeout(65000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instructions,lesson:{day,stage,continued}})})
  const j=await r.json().catch(()=>({}))
  if(r.status===429&&j.kind!=='daily'&&attempt<2){await new Promise(resolve=>setTimeout(resolve,7000));continue}
  if(r.status===429)throw Error(j.kind==='daily'?'The free daily allowance is used up. Your lesson is saved. Nothing paid is used.':'The free service is rate limiting. Your lesson is saved; try later. Nothing paid is used.')
  if(!r.ok)throw Error(j.error||'The free AI could not reply.')
  if(typeof j.reply!=='string'||!j.reply.trim())throw Error('The AI returned no usable reply. Try again; this is not a scored attempt.')
  return j.reply
 }
}
