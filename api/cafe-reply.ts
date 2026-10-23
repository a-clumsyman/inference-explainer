// Server route: the game's hosted model call. Keys stay here, never in the browser.
// Needs env var GEMINI_API_KEY from a Free-tier Google AI Studio project (no billing linked). Optional GEMINI_MODEL.
import { POOL, FACTS, SYSTEM_SUFFIX } from '../cafe/src/cafe/data'

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite' // has a Free tier per Google's pricing page
// Best-effort only: this counter lives in one server instance's memory, so it is NOT a reliable global limit.
// The real financial boundary is a Google project with no billing account linked, plus the per-request caps below.
const DAILY_CAP = Number(process.env.CAFE_DAILY_CAP || 400)
let day = ''
let used = 0

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { instructions, customerId } = req.body ?? {}
  const c = POOL.find((p) => p.id === customerId)
  if (typeof instructions !== 'string' || instructions.length > 600 || !c) return res.status(400).json({ error: 'bad request' })
  const today = new Date().toISOString().slice(0, 10)
  if (today !== day) { day = today; used = 0 }
  if (used >= DAILY_CAP) return res.status(429).json({ error: 'The free daily allowance for this game is used up. Try again tomorrow.' })
  // Fails closed: no model call until the owner confirms the key's project is on the Free tier and sets CAFE_ENABLED=1.
  if (process.env.CAFE_ENABLED !== '1') return res.status(503).json({ error: 'hosted model is switched off' })
  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(503).json({ error: 'hosted model not configured' })
  used++
  const system = `${instructions.trim()}\n\nFacts sheet:\n${FACTS.map((f) => '- ' + f).join('\n')}\n\n${SYSTEM_SUFFIX}`
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: c.line }] }],
      generationConfig: { maxOutputTokens: 80, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? 'The free allowance is busy or used up. Try again shortly.' : 'model error', status: r.status })
  const j: any = await r.json()
  const text = (j?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? '').join('')
  res.status(200).json({ reply: text.trim(), model: MODEL })
}
