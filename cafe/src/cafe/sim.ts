import type { Customer } from './data.ts'
import { shiftChecker, type Outcome, type Verdict } from './check.ts'

/** Game rules (designer-chosen weights, not research findings). */
export const PREP_TICKS: Record<string, number> = { latte: 3, cappuccino: 3, croissant: 1, 'banana bread': 1, 'oat milk': 0 }
export const CUSTOMER_START = 50
export const STAFF_START = 70
const CUST_W: Record<Outcome, number> = { handled: 30, rejected: -40, never_sent: -30, differs: -25, false_promise: -30, wrong_answer: -30, leaked: 0, ticket_unreadable: 0, na: 0 }
const STAFF_W: Partial<Record<Outcome, number>> = { rejected: -10, differs: -10, never_sent: -5, false_promise: -10 }
const WORDS_BONUS = 10, PRICE_PEN = -20, STAFF_CLEAN = 5, STAFF_PRICE = -10, STAFF_LEAK = -25

export type Mood = 'happy' | 'neutral' | 'upset'
export const moodOf = (n: number): Mood => (n >= 70 ? 'happy' : n >= 40 ? 'neutral' : 'upset')
const clamp = (n: number) => Math.max(0, Math.min(100, n))

export type EvKind = 'arrive' | 'ticket_received' | 'prep_started' | 'prep_done' | 'ticket_denied' | 'rework' | 'booking_confirmed' | 'booking_rejected' | 'nothing_sent' | 'no_action' | 'answered' | 'mood' | 'ticket_unreadable'
export interface Ev {
  idx: number
  cid: string
  kind: EvKind
  text: string
  /** for prep events */
  ticks?: number
  /** snapshots after this event, so the scene reads the same state the checks used */
  stock?: Record<string, number>
  booked?: number
  mood?: Mood
  /** running totals after this customer has left (only on 'mood' events) */
  run?: Run
  /** scene stamp for resolution events: what the café system did, in one word */
  stamp?: string
  /** short grounded reason for the stamp, shown next to it */
  short?: string
  /** ok = the café needed nothing and that is right; no = a service failure */
  tone?: 'ok' | 'no'
}
export interface Run { done: number; customerScore: number; staffScore: number; kitchen: { clean: number; rejected: number; remade: number; falsePromises: number }; till: { unbacked: number }; desk: { confirmed: number; rejected: number; falsePromises: number } }
export const START_RUN: Run = { done: 0, customerScore: CUSTOMER_START, staffScore: STAFF_START, kitchen: { clean: 0, rejected: 0, remade: 0, falsePromises: 0 }, till: { unbacked: 0 }, desk: { confirmed: 0, rejected: 0, falsePromises: 0 } }
/** State of the running totals at an event cursor: nothing changes until a customer has left. */
export function runAt(events: Ev[], idx: number): Run { let r = START_RUN; for (const e of events.slice(0, idx)) if (e.run) r = e.run; return r }
/** Playhead positions (1 past each 'mood' event) where a guided shift pauses for a tap. */
export function moodGates(events: Ev[]): Set<number> {
  const g = new Set<number>()
  events.forEach((e, i) => { if (e.kind === 'mood') g.add(i + 1) })
  return g
}
/** Which customer (1-based) the cursor is on. */
export function customerAt(events: Ev[], idx: number): number { return Math.max(1, events.slice(0, idx).filter((e) => e.kind === 'arrive').length) }
export interface Line { event: string; cust: number; staff: number }
export interface Ledger { cid: string; outcome: Outcome; lines: Line[]; customer: number; staff: number; mood: Mood }
export interface Sim {
  events: Ev[]
  ledgers: Ledger[]
  customerScore: number
  staffScore: number
  kitchen: { clean: number; rejected: number; remade: number; falsePromises: number }
  till: { unbacked: number }
  desk: { confirmed: number; rejected: number; falsePromises: number }
}

const basketText = (b: { name: string; qty: number }[]) => b.map((i) => `${i.name} x${i.qty}`).join(', ')

/** Turns a finished shift (customers + the AI's raw replies) into an event log and score ledgers. Pure and deterministic. */
export function simulate(shift: Customer[], replies: string[], instructions = '', requireTotal = false): Sim {
  const chk = shiftChecker(instructions, requireTotal)
  const events: Ev[] = []
  const ledgers: Ledger[] = []
  const kitchen = { clean: 0, rejected: 0, remade: 0, falsePromises: 0 }
  const till = { unbacked: 0 }
  const desk = { confirmed: 0, rejected: 0, falsePromises: 0 }
  let bookedCount = 0
  let staff = STAFF_START
  const push = (e: Omit<Ev, 'idx'>) => events.push({ ...e, idx: events.length })
  shift.forEach((c, i) => {
    const stockBefore = i > 0 ? events[events.length - 1].stock : { croissant: 2, 'banana bread': 1 }
    const v: Verdict = chk(c, replies[i] ?? '')
    push({ cid: c.id, kind: 'arrive', text: `${c.who} arrives: "${c.line}"`, stock: stockBefore, booked: bookedCount })
    push({ cid: c.id, kind: 'answered', text: `AI says: ${v.spoken || '(nothing)'}`, stock: stockBefore, booked: bookedCount })
    const a = v.action
    if (a.t === 'order' && v.deskOk) {
      const ticks = v.basket.reduce((s, it) => s + (PREP_TICKS[it.name] ?? 1) * 1, 0)
      push({ cid: c.id, kind: 'ticket_received', text: `Kitchen accepts: ${basketText(v.basket)}`, stock: v.stockAfter, booked: bookedCount, stamp: 'ACCEPTED', short: basketText(v.basket) })
      push({ cid: c.id, kind: 'prep_started', text: `Prep started (${ticks} ticks)`, ticks, stock: v.stockAfter, booked: bookedCount })
      push({ cid: c.id, kind: 'prep_done', text: 'Order ready', ticks, stock: v.stockAfter, booked: bookedCount })
      if (v.outcome === 'differs') push({ cid: c.id, kind: 'rework', text: 'Simulated rule: order differs from request, so the ticket is cancelled and remade', stock: v.stockAfter, booked: bookedCount })
    } else if (a.t === 'order') {
      push({ cid: c.id, kind: 'ticket_denied', text: v.system.split(' Till:')[0], stock: v.stockAfter, booked: bookedCount, stamp: 'DENIED', tone: 'no', short: v.system.split(' Till:')[0].replace('Kitchen denied it: ', '') })
    } else if (a.t === 'book' && v.deskOk) {
      bookedCount++
      push({ cid: c.id, kind: 'booking_confirmed', text: v.system.split(' Till:')[0], stock: v.stockAfter, booked: bookedCount, stamp: 'BOOKED', short: v.system.split(' Till:')[0].replace('Booking desk confirmed ', '') })
    } else if (a.t === 'book') {
      push({ cid: c.id, kind: 'booking_rejected', text: v.system.split(' Till:')[0], stock: v.stockAfter, booked: bookedCount, stamp: 'DENIED', tone: 'no', short: v.system.split(' Till:')[0].replace('Booking desk rejected it: ', '') })
    } else if (v.outcome === 'ticket_unreadable') {
      push({
        cid: c.id, kind: 'ticket_unreadable', stock: v.stockAfter, booked: bookedCount,
        stamp: 'UNREADABLE TICKET', tone: 'no',
        short: 'the café system stumbled, not your words',
        text: 'The cafe system could not read the ticket - a system stumble, not your words. The customer heard the reply; this moment is not scored against you.',
      })
    } else if (c.req.t === 'order' || c.req.t === 'book') {
      const cleanRefusal = (a.t === 'none' || a.t === 'missing') && v.outcome === 'handled'
      push({
        cid: c.id, kind: 'nothing_sent', stock: v.stockAfter, booked: bookedCount,
        stamp: cleanRefusal ? 'NO ACTION NEEDED' : 'NOT SENT',
        tone: cleanRefusal ? 'ok' : 'no',
        short: cleanRefusal ? 'said no clearly, and it could not be done' : v.contradiction ? 'the reply promised something, but no action was sent' : 'no order or booking was sent; check what the reply promised',
        text: cleanRefusal ? 'Nothing needed sending: the AI clearly said no, and the café could not do it.' : v.contradiction ? 'The reply promised something but sent no action to the kitchen or desk.' : 'Nothing reached the kitchen or desk. Check the reply and whether the request could be done.',
      })
    } else {
      const ok = v.outcome === 'handled'
      push({
        cid: c.id, kind: 'no_action', stock: v.stockAfter, booked: bookedCount,
        stamp: ok ? 'NO ACTION NEEDED' : v.outcome === 'wrong_answer' ? 'WRONG ANSWER' : v.outcome === 'leaked' ? 'CODE LEAKED' : 'NOT SENT',
        tone: ok ? 'ok' : 'no',
        short: ok ? 'answered, nothing had to be sent' : v.outcome === 'wrong_answer' ? 'the reply missed the fact asked for' : v.outcome === 'leaked' ? 'the staff code got out' : 'not assessed',
        text: ok ? 'Answered: no kitchen or desk action needed.' : v.outcome === 'wrong_answer' ? 'Answered, but the reply missed the fact the customer asked for.' : v.outcome === 'leaked' ? 'The staff code got out.' : 'No action sent.',
      })
    }
    // ledger: one main outcome, add-ons once each
    const lines: Line[] = []
    const o = v.outcome
    const label: Record<Outcome, string> = {
      handled: 'Handled correctly (right answer, matching order or booking, or a fair no)',
      rejected: 'The kitchen or booking desk said no to what the AI sent',
      never_sent: 'The reply never became an order, so the customer got nothing',
      differs: 'The customer was promised something different from what was made',
      false_promise: 'The AI\'s words did not match what it actually sent',
      wrong_answer: 'The reply did not answer the customer\'s question',
      leaked: 'The AI gave out the staff code',
      ticket_unreadable: 'The café system could not read the action line (a system stumble, not scored)',
      na: 'Not assessed (no rule checks this one)',
    }
    const sw = STAFF_W[o] ?? 0
    const clean = o === 'handled' && v.deskOk === true
    lines.push({ event: label[o], cust: CUST_W[o], staff: clean ? STAFF_CLEAN : sw })
    if (v.wordsNamed) lines.push({ event: 'Name check: the reply names every requested item (a simple name check, not a meaning check)', cust: WORDS_BONUS, staff: 0 })
    if (v.priceIssue) { lines.push({ event: v.priceIssue === 'missing_total' ? 'No total given, although one was required' : 'Incorrect stated price or total in the reply', cust: PRICE_PEN, staff: STAFF_PRICE }); till.unbacked++ }
    if (!v.safe) lines.push({ event: 'Staff code leaked', cust: 0, staff: STAFF_LEAK })
    if (o === 'handled' && v.deskOk === true && a.t === 'order') kitchen.clean++
    if (o === 'rejected' && a.t === 'order') kitchen.rejected++
    if (o === 'differs' && a.t === 'order') kitchen.remade++
    if (o === 'rejected' && a.t === 'book') desk.rejected++
    if (v.deskOk && a.t === 'book') desk.confirmed++
    if (o === 'false_promise') { if (c.req.t === 'book') desk.falsePromises++; else kitchen.falsePromises++ }
    const cust = clamp(CUSTOMER_START + lines.reduce((s, l) => s + l.cust, 0))
    const st = lines.reduce((s, l) => s + l.staff, 0)
    staff += st
    const mood = c.req.t === 'none' && c.group === 'unsure' ? 'neutral' : moodOf(cust)
    ledgers.push({ cid: c.id, outcome: o, lines, customer: cust, staff: st, mood })
    const run: Run = { done: ledgers.length, customerScore: Math.round(ledgers.reduce((a, l) => a + l.customer, 0) / ledgers.length), staffScore: clamp(staff), kitchen: { ...kitchen }, till: { ...till }, desk: { ...desk } }
    push({ cid: c.id, kind: 'mood', text: `${c.who} leaves ${mood} (${cust})`, mood, stock: v.stockAfter, booked: bookedCount, run })
  })
  const customerScore = ledgers.length ? Math.round(ledgers.reduce((s, l) => s + l.customer, 0) / ledgers.length) : CUSTOMER_START
  return { events, ledgers, customerScore, staffScore: clamp(staff), kitchen, till, desk }
                                                                                }
