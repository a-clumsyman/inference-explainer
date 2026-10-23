import type { Sim } from './sim.ts'

/** Game rules (designer-chosen, tunable). Only logged service failures count. Prompt length never does. */
export const WALKOUTS_MAX = 3
export const REFUSALS_IN_A_ROW = 4

export interface Over { over: boolean; warn: boolean; at: number; reason: string; walkouts: number; streak: number }

/** Walk-out: a request that could be served never reached the kitchen or desk. Refusal: the kitchen or desk said no. */
export function gameOver(sim: Sim, lvl: number): Over {
  const kinds: Record<string, string> = {}
  for (const e of sim.events) if (['nothing_sent', 'ticket_denied', 'booking_rejected'].includes(e.kind)) kinds[e.cid] = e.kind
  let walkouts = 0, streak = 0, at = 0, reason = ''
  const order = sim.ledgers.map((l) => l.cid)
  for (let i = 0; i < order.length; i++) {
    const k = kinds[order[i]]
    if (k === 'nothing_sent') walkouts++
    streak = k === 'ticket_denied' || k === 'booking_rejected' ? streak + 1 : 0
    if (!reason && walkouts >= WALKOUTS_MAX) { reason = `${walkouts} customers left without being served (nothing reached the kitchen or desk).`; at = i + 1 }
    if (!reason && streak >= REFUSALS_IN_A_ROW) { reason = `The kitchen or desk refused ${streak} requests in a row.`; at = i + 1 }
  }
  return { over: !!reason && lvl >= 1, warn: !!reason && lvl < 1, at, reason, walkouts, streak }
}
