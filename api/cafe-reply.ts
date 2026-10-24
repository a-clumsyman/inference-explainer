import {customerAnswer} from '../cafe/src/cafe/conversation.ts'
import {FACTS,SYSTEM_SUFFIX,CONTRACT,POOL,STOCK,OPEN_SLOTS,TABLES} from '../cafe/src/cafe/data.ts'
// Server route: the game's hosted model call. Keys stay here, never in the browser.
// Needs env var GEMINI_API_KEY from a Free-tier Google AI Studio project (no billing linked). Optional GEMINI_MODEL.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' // has a Free tier per Google's pricing page
// Best-effort only: this counter lives in one server instance's memory, so it is NOT a reliable global limit.
// The real financial boundary is a Google project with no billing account linked, plus the per-request caps below.
const ALLOWED_MODELS = ['gemini-3.5-flash-lite']
const DAILY_CAP = Number(process.env.CAFE_DAILY_CAP || 400)
let day = ''
let used = 0

const CORS_ORIGINS = new Set(['https://clumsyman.xyz', 'https://www.clumsyman.xyz'])
function cors(req: any, res: any): boolean {
  const origin = req.headers?.origin
  const allowed = typeof origin === 'string' && CORS_ORIGINS.has(origin)
  if (allowed) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
  if (req.method === 'OPTIONS') {
    if (allowed) {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '86400')
    }
    res.status(204).end()
    return true
  }
  return false
}

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { instructions, customerId, model, escalate, state, continued, priorReply } = req.body ?? {}
  // Optional model pick, only from these Free-tier models (used for the same-scenario comparison). Anything else falls back to the default.
  const useModel = ALLOWED_MODELS.includes(model) ? model : MODEL
  const c = POOL.find(p=>p.id===customerId)
  if (typeof instructions !== 'string' || instructions.length > 2400 || !c) return res.status(400).json({ error: 'bad request' })
  const today = new Date().toISOString().slice(0, 10)
  if (today !== day) { day = today; used = 0 }
  if (used >= DAILY_CAP) return res.status(429).json({ error: 'The free daily allowance for this game is used up. Try again tomorrow.', kind: 'daily' })
  // Fails closed: no model call until the owner confirms the key's project is on the Free tier and sets CAFE_ENABLED=1.
  if (process.env.CAFE_ENABLED !== '1') return res.status(503).json({ error: 'hosted model is switched off' })
  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(503).json({ error: 'hosted model not configured' })
  used++
  // Accept only the game's finite numeric state, never arbitrary new instructions.
  const validCount = (x: unknown, max: number) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max
  const stock = Object.fromEntries(Object.entries(STOCK).map(([name, initial]) => [name, validCount(state?.stock?.[name], initial) ? state.stock[name] : initial]))
  const booked = Object.fromEntries(OPEN_SLOTS.map((slot) => [slot, validCount(state?.booked?.[slot], TABLES) ? state.booked[slot] : 0]))
  const current = `Current cafe state, replacing the opening stock/table counts above: ${JSON.stringify({ stock, tablesAlreadyBooked: booked })}. These counts are current when this customer asks. Do not use the opening counts instead.`
  const system = `${instructions.trim()}\n\nFacts sheet:\n${FACTS.map((f) => '- ' + f).join('\n')}\n\n${current}\n\n${SYSTEM_SUFFIX}\n\n${CONTRACT}`
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(55000),
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: continued===true&&(c.clarify||c.req.t==='order')&&typeof priorReply==='string'&&priorReply.length<=2000 ? [
        {role:'user',parts:[{text:c.line}]},
        {role:'model',parts:[{text:priorReply}]},
        {role:'user',parts:[{text:customerAnswer(c)}]},
      ] : [{role:'user',parts:[{text:escalate===true?`${c.line}\nThe customer returns: That did not work. Sort this out now.`:c.line}]}],
      generationConfig: { maxOutputTokens: 300, temperature: 0.7, thinkingConfig: { thinkingLevel: 'minimal' } },
    }),
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    if (r.status !== 429) return res.status(502).json({ error: 'model error', status: r.status, detail: body.slice(0, 300) })
    // Google names the quota that ran out. Per-day means exhausted for today; anything else is short-term throttling.
    const daily = /PerDay/i.test(body)
    return res.status(429).json({ error: daily ? 'The free daily allowance is used up.' : 'The free service is rate limiting right now.', kind: daily ? 'daily' : 'rate' })
  }
  const j: any = await r.json()
  const text = (j?.candidates?.[0]?.content?.parts ?? []).filter((x: any) => !x.thought).map((x: any) => x.text ?? '').join('')
  if (!text.trim()) return res.status(502).json({ error: 'The AI returned no reply. Your shift can resume at this customer.' })
  res.status(200).json({ reply: text.trim(), model: useModel })
  }
