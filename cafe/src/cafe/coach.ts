import { SECRET_CODE } from './data.ts'
import { leaked, wordCount, type Verdict } from './check.ts'
import type { Customer } from './data.ts'
import type { Ledger } from './sim.ts'

// When served from clumsyman.xyz, the coach API lives on the functions origin.
const API_BASE = typeof location !== 'undefined' && ['clumsyman.xyz', 'www.clumsyman.xyz'].includes(location.hostname) ? 'https://inference-explainer.vercel.app' : ''

/** What the coach may talk about: only customers whose result had a problem, with the engine's own evidence. */
export interface Evidence {
  customerId: string
  who: string
  line: string
  reply: string
  system: string
  note: string
  outcome: string
  ledger: string[]
}
export interface Tip { customerId: string; change: string; suggestedLine: string; watch: string; /** verbatim quote from the player's instructions, only kept if it appears word for word */ relatedLine?: string }
export interface CoachResult { summary: string; tips: Tip[] }

/** Hides the staff code, in any spelling the leak check recognises, before any text leaves the page. */
export function redact(text: string): string {
  let t = text.replace(/m\W*o\W*c\W*h\W*a\W*[-_ ]?\W*7/gi, '[hidden]')
  if (leaked(t)) t = t.replace(/[\s\S]*/, '[hidden: contains the staff code]')
  return t
}

const problem = (v: Verdict) => !v.ok || v.contradiction || v.refused || v.honest === false

export function buildEvidence(rows: { c: Customer; reply: string; v: Verdict }[], ledgers: Ledger[]): Evidence[] {
  const out: Evidence[] = []
  rows.forEach((r, i) => {
    if (!problem(r.v)) return
    out.push({
      customerId: r.c.id, who: r.c.who, line: r.c.line, reply: redact(r.reply.slice(0, 600)), system: redact(r.v.system), note: r.v.note + (r.v.refused ? ' It turned away a customer it could have served.' : ''),
      outcome: r.v.outcome, ledger: ledgers[i].lines.map((l) => `${l.event} (customer ${l.cust >= 0 ? '+' : ''}${l.cust}, staff ${l.staff >= 0 ? '+' : ''}${l.staff})`),
    })
  })
  return out
}

/** Keeps only tips that point at a customer who really had a problem, are short, and never carry the staff code. Everything else is dropped. */
export function validateTips(raw: unknown, evidence: Evidence[], instructions = ''): CoachResult {
  const ids = new Set(evidence.map((e) => e.customerId))
  const r = (raw ?? {}) as { summary?: unknown; tips?: unknown }
  const clean = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '')
  const tips: Tip[] = []
  const seen = new Set<string>()
  for (const t of Array.isArray(r.tips) ? r.tips : []) {
    const id = clean(t?.customerId, 20)
    const suggestedLine = clean(t?.suggestedLine, 300)
    const change = clean(t?.change, 300)
    const watch = clean(t?.watch, 300)
    const relatedLine = clean(t?.relatedLine, 200)
    if (!ids.has(id) || seen.has(id) || !suggestedLine || !change) continue
    if (wordCount(suggestedLine) > 40) continue
    if ([suggestedLine, change, watch].some((s) => leaked(s) || s.includes(SECRET_CODE))) continue
    seen.add(id)
    // the quote is shown as "your words said" only when it appears verbatim in the player's instructions
    tips.push({ customerId: id, change, suggestedLine, watch, relatedLine: relatedLine && instructions.includes(relatedLine) ? relatedLine : undefined })
    if (tips.length >= 4) break
  }
  const summary = clean(r.summary, 400)
  return { summary: leaked(summary) ? '' : summary, tips }
}

export class CoachPaused extends Error {}

export async function askCoach(instructions: string, evidence: Evidence[], standIn: boolean): Promise<CoachResult> {
  if (standIn) return standInCoach(instructions, evidence)
  const r = await fetch(API_BASE + '/api/cafe-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instructions: redact(instructions), evidence }) })
  const j = await r.json().catch(() => ({}))
  if (r.status === 429) throw new CoachPaused(j.kind === 'daily' ? 'PAUSED: the free daily allowance is used up. No tips until it resets. Nothing paid is used.' : 'PAUSED: the free service is rate limiting right now. Wait a minute and press the button again. Nothing paid is used.')
  if (!r.ok) throw new Error(j.error || `server error ${r.status}`)
  return validateTips(j, evidence)
}

/** Layout test only. Fixed text, not a model. Shown with a label. */
const COACH_STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'when', 'your', 'them', 'they', 'please', 'customer', 'customers', 'cafe', 'assistant', 'helpful', 'answer', 'always', 'only', 'tell', 'says', 'reply', 'replies'])
const contentWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !COACH_STOP.has(w))

/** A line is only 'related' when it shares distinctive content words with the moment. Generic starter lines get no tag. */
function relatedLineFor(instructions: string, e: Evidence): string | undefined {
  const target = new Set(contentWords(e.line + ' ' + e.reply))
  let best: string | undefined; let bestN = 0
  for (const raw of instructions.split(/\r?\n/)) {
    const l = raw.trim(); if (l.split(/\s+/).length < 4) continue
    const n = contentWords(l).filter((w) => target.has(w)).length
    if (n > bestN) { bestN = n; best = l }
  }
  return bestN >= 1 ? best : undefined
}

function standInCoach(instructions: string, evidence: Evidence[]): CoachResult {
  return {
    summary: 'STAND-IN text for layout testing, not from a model.',
    tips: evidence.slice(0, 2).map((e) => ({ customerId: e.customerId, change: "Stand-in tip: tell the AI to always pass the customer's real order to the kitchen.", suggestedLine: 'Always send the kitchen every item and extra the customer asked for, exactly as they said it.', watch: 'Stand-in: re-run and check whether the kitchen gets the order this time.', ...(relatedLineFor(instructions, e) ? { relatedLine: relatedLineFor(instructions, e)! } : {}) })),
  }
}
