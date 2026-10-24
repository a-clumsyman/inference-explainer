import type { Sim } from './sim.ts'

/** Customers that must be served right to survive a shift of `planned` customers.
 *  Full 8-customer shifts keep the intended 6-of-8 bar; shorter shifts allow up to two misses but never let 0 right win. */
export function passMarkFor(planned: number): number {
  return Math.max(1, Math.min(6, planned - 2))
}

/** Game rules (designer-chosen, tunable). Only logged service failures count. Prompt length never does. */
export const WALKOUTS_MAX = 3
export const REFUSALS_IN_A_ROW = 4

export interface Over { over: boolean; warn: boolean; at: number; reason: string; walkouts: number; streak: number }

/** Walk-out: a request that could be served never reached the kitchen or desk. A refusal the checker confirmed as correct is NOT a walk-out - the café could not do it and the AI said so clearly. Refusal: the kitchen or desk said no. */
export function gameOver(sim: Sim, lvl: number): Over {
  const kinds: Record<string, string> = {}
  for (const e of sim.events) if (['nothing_sent', 'ticket_denied', 'booking_rejected'].includes(e.kind)) kinds[e.cid] = e.kind
  const handled = new Set(sim.ledgers.filter((l) => l.outcome === 'handled').map((l) => l.cid))
  let walkouts = 0, kitchenStreak = 0, deskStreak = 0, at = 0, reason = ''
  const order = sim.ledgers.map((l) => l.cid)
  for (let i = 0; i < order.length; i++) {
    if (sim.ledgers[i].assessed === false) { kitchenStreak = 0; deskStreak = 0; continue }
    const k = kinds[order[i]]
    // an unreadable ticket is a café system stumble: never a walk-out, never a refusal
    if (k === 'nothing_sent' && !handled.has(order[i])) walkouts++
    kitchenStreak = k === 'ticket_denied' ? kitchenStreak + 1 : 0
    deskStreak = k === 'booking_rejected' ? deskStreak + 1 : 0
    if (!reason && walkouts >= WALKOUTS_MAX) { reason = `${walkouts} customers left without being served (nothing reached the kitchen or desk).`; at = i + 1 }
    if (!reason && kitchenStreak >= REFUSALS_IN_A_ROW) { reason = `The kitchen refused ${kitchenStreak} requests in a row.`; at = i + 1 }
    if (!reason && deskStreak >= REFUSALS_IN_A_ROW) { reason = `The booking desk refused ${deskStreak} requests in a row.`; at = i + 1 }
  }
  return { over: !!reason && lvl >= 1, warn: !!reason && lvl < 1, at, reason, walkouts, streak: Math.max(kitchenStreak, deskStreak) }
}
