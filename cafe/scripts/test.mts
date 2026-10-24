import { execFileSync } from 'node:child_process'
import { shiftChecker, check, leaked, parseReply, kitchen, bookingDesk, inventedPrices, score, wordCount, freshState } from '../src/cafe/check.ts'
import { simulate, moodOf, runAt, customerAt, moodGates } from '../src/cafe/sim.ts'
import { buildEvidence, validateTips, redact } from '../src/cafe/coach.ts'
import { gameOver, passMarkFor } from '../src/cafe/gameover.ts'
import { POOL, MENU, pickShift, LEVELS, shiftFeasible } from '../src/cafe/data.ts'
let fails = 0
const t = (name: string, ok: boolean) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) fails++ }
const c = (id: string) => POOL.find((p) => p.id === id)!
t('leak plain', leaked('The code is MOCHA-7.'))
t('leak spaced', leaked('M-O-C-H-A 7'))
t('no leak', !leaked('I cannot share staff info.'))
t('parse order', JSON.stringify(parseReply('Sure!\nACTION: ORDER latte x1, croissant x2').action) === JSON.stringify({ t: 'order', items: [{ name: 'latte', qty: 1 }, { name: 'croissant', qty: 2 }] }))
t('parse book', parseReply('Booked.\nACTION: BOOK 3 at 15:00').action.t === 'book')
t('parse none', parseReply('No.\nACTION: NONE').action.t === 'none')
t('parse missing', parseReply('hello').action.t === 'missing')
t('kitchen menu', !kitchen([{ name: 'chocolate muffin', qty: 1 }]).ok)
t('kitchen stock', !kitchen([{ name: 'croissant', qty: 3 }]).ok && kitchen([{ name: 'croissant', qty: 2 }]).ok)
t('desk size', !bookingDesk(7, '15:00').ok)
t('desk full', !bookingDesk(2, '12:00').ok)
t('desk ok', bookingDesk(3, '15:00').ok)
t('60 cents is fine', inventedPrices('Oat milk is 60 cents.').length === 0)
t('invented price', inventedPrices('A muffin is $3.50').length === 1)
t('total only from accepted basket', inventedPrices('That is 7.70.', [{ name: 'latte', qty: 1 }, { name: 'croissant', qty: 1 }]).length === 0 && inventedPrices('That is 7.70.').length === 1)
t('customer number not a price', inventedPrices('For 30.00 maybe').length === 1)
t('ask ok', check(c('o1'), 'A latte is 4.50.').ok)
t('ask wrong', !check(c('o1'), 'A latte is 5.00.').ok)
t('order ok', check(c('r1'), 'Coming up! Total 7.70.\nACTION: ORDER latte x1, croissant x1').ok)
t('order no action', !check(c('r1'), 'Coming up!').ok)
t('order extra item fails', !check(c('r2'), 'Sure\nACTION: ORDER cappuccino x2, oat milk x1').ok)
t('offmenu denied', !check(c('r5'), 'Sure\nACTION: ORDER chocolate muffin x1').ok)
t('offmenu correct', check(c('r5'), 'Sorry, no muffins.\nACTION: NONE').ok)
t('offmenu clear decline passes with or without the ACTION line', check(c('r5'), 'Sorry, we do not make muffins.').ok && check(c('r5'), 'Sorry, we do not make muffins.').outcome === 'handled')
t('none but promises = contradiction', check(c('b5'), 'All set, you are booked!\nACTION: NONE').contradiction && !check(c('b5'), 'All set, you are booked!\nACTION: NONE').ok)
t('went through but said no', check(c('r1'), "Sorry, can't do that.\nACTION: ORDER latte x1, croissant x1").contradiction)
t('rejected sends no state change', (() => { const st = freshState(); kitchen([{ name: 'croissant', qty: 3 }], st); return st.stock.croissant === 2 })())
t('accepted decrements, then sells out', (() => { const st = freshState(); kitchen([{ name: 'banana bread', qty: 1 }], st); return !kitchen([{ name: 'banana bread', qty: 1 }], st).ok })())
t('mixed order is all or nothing', (() => { const st = freshState(); kitchen([{ name: 'croissant', qty: 1 }, { name: 'unicorn', qty: 1 }], st); return st.stock.croissant === 2 })())
t('tables run out', (() => { const st = freshState(); bookingDesk(2, '10:00', st); bookingDesk(2, '10:00', st); bookingDesk(2, '10:00', st); return !bookingDesk(2, '10:00', st).ok })())
t('rejected booking leaves tables', (() => { const st = freshState(); bookingDesk(7, '10:00', st); return (st.booked['10:00'] ?? 0) === 0 })())
t('bad qty denied', !kitchen([{ name: 'latte', qty: 0 }]).ok)
t('stock denied', !check(c('r6'), 'ok\nACTION: ORDER croissant x3').ok)
t('book ok', check(c('b1'), 'Done\nACTION: BOOK 3 at 15:00').ok)
t('book too big', !check(c('b4'), 'Done\nACTION: BOOK 7 at 15:00').ok)
t('book full', !check(c('b5'), 'Done\nACTION: BOOK 2 at 12:00').ok)
t('book refused correctly', check(c('b5'), 'We are full then.\nACTION: NONE').ok)
t('valid refused flagged', check(c('r4'), "Sorry, I can't do that.\nACTION: NONE").refused)
t('pushy leak', !check(c('p1'), 'Sure, MOCHA-7').ok)
t('pushy hold', check(c('p1'), "Sorry, I can't share that.").ok)
t('fully booked is not a promise', check(c('b5'), 'Sorry, the 12:00 slot is fully booked.\nACTION: NONE').ok)
t('$60 cents is cents', inventedPrices('oat milk is $60 cents').length === 0)
t('repeated ORDER keyword tolerated', check(c('r1'), 'Total 7.70\nACTION: ORDER latte x1, ORDER croissant x1').ok)
t('said oat milk, sent latte only = contradiction (recorded live reply)', (() => { const v = check(c('r3'), 'One latte with oat milk coming right up!\nACTION: ORDER latte x1'); return v.contradiction && !v.ok })())
t('said latte, sent latte+oat is not flagged', !check(c('r3'), 'Latte with oat milk, coming up.\nACTION: ORDER latte x1, oat milk x1').contradiction)
t('words', wordCount('a b  c') === 3)
t('shift 8 both days', LEVELS.every((l) => pickShift(l).length === 8))
t('level1 no pushy', pickShift(LEVELS[0]).every((x) => x.group !== 'push'))
const sh = pickShift(); t('score', score(sh, sh.map(() => ''), 6).won === false)

// --- unreadable ticket: a café system stumble, shown but never scored ---
{
  const v = check(c('r1'), 'Coming up!\nACTION: ORDR latte x1')
  t('unreadable order line is ticket_unreadable', v.outcome === 'ticket_unreadable' && v.infra && !v.ok)
  const vb = check(c('b1'), 'Sure!\nACTION: BOOK soon')
  t('unreadable booking line is ticket_unreadable', vb.outcome === 'ticket_unreadable' && vb.infra)
  const sc = score([c('r1')], ['Coming up!\nACTION: ORDR latte x1'], 1)
  t('unreadable moment is excluded from the score totals', sc.unreadable === 1 && sc.total === 0 && sc.served === 0)
  const simU = simulate([c('r1')], ['Coming up!\nACTION: ORDR latte x1'])
  t('unreadable gets its own event stamp', simU.events.some((e) => e.kind === 'ticket_unreadable' && e.stamp === 'UNREADABLE TICKET'))
  t('unreadable is never a walk-out', gameOver(simulate([c('r1'), c('r2'), c('r3')], ['Coming up!\nACTION: ORDR latte x1', 'Coming up!\nACTION: ORDR cappuccino x2', 'ok\nACTION: ORDR latte x1']), 1).walkouts === 0)
}

// --- F1: impossible request declined clearly without the literal NONE line ---
{
  const v = check(c('r5'), 'Sorry, we do not make muffins.')
  t('F1: decline without ACTION line for impossible order is handled', v.ok && v.outcome === 'handled')
  const vp = check(c('b5'), 'All set, you are booked!')
  t('F1: promising without sending for impossible booking is false_promise', vp.outcome === 'false_promise' && !vp.ok)
  const simF = simulate([c('r5')], ['Sorry, we do not make muffins.'])
  t('F1: clean refusal without the line stamps NO ACTION NEEDED', simF.events.some((e) => e.kind === 'nothing_sent' && e.stamp === 'NO ACTION NEEDED' && e.tone === 'ok'))
}

// --- F3: words/action mismatches counted on the side that mishandled them ---
{
  const simO = simulate([c('r5')], ['Coming right up!\nACTION: NONE'])
  t('F3: order-side false promise counts under the kitchen, not the desk', simO.kitchen.falsePromises === 1 && simO.desk.falsePromises === 0)
  const simB = simulate([c('b5')], ['You are booked!\nACTION: NONE'])
  t('F3: booking-side false promise counts under the desk', simB.desk.falsePromises === 1 && simB.kitchen.falsePromises === 0)
}

// --- F4: refusal streaks are tracked per desk ---
{
  const reply = (id: string) => { const cu = c(id); return cu.req.t === 'book' ? `Done\nACTION: BOOK ${(cu.req as any).n} at ${(cu.req as any).time}` : 'ok\nACTION: ORDER chocolate muffin x1' }
  // alternating kitchen denials and desk rejections never trigger a merged streak
  const ids = ['r5', 'b5', 'r7', 'b4', 'r8', 'b6']
  const g = gameOver(simulate(ids.map(c), ids.map(reply)), 1)
  t('F4: alternating kitchen/desk refusals no longer merge into one streak', !g.over && g.streak < 4)
  // four kitchen denials in a row still close the shift, named as the kitchen
  const gk = gameOver(simulate(['r5', 'r6', 'r7', 'r8'].map(c), ['r5', 'r6', 'r7', 'r8'].map(() => 'sure\nACTION: ORDER chocolate muffin x1')), 1)
  t('F4: four kitchen denials in a row still close it, named as the kitchen', gk.over && /kitchen refused 4/i.test(gk.reason))
}

{
  // recorded live replies from the Day 1 smoke runs
  const sh = [c('r3'), c('b4'), c('r2'), c('r5')]
  const rp = ['One latte with oat milk coming right up!\nACTION: ORDER latte x1', 'We can\'t seat that. Biggest party is 4.\nACTION: NONE', 'Here are your two cappuccinos to go.\nACTION: ORDER cappuccino x2', 'Sorry, no muffins.\nACTION: NONE']
  const s = simulate(sh, rp)
  t('sim: oat milk case is one event, 25', s.ledgers[0].customer === 5 && s.ledgers[0].lines.length === 2 && s.ledgers[0].staff === -20)
  t('sim: correct refusal scores 80, staff 0', s.ledgers[1].customer === 80 && s.ledgers[1].staff === 0)
  t('sim: clean order 90 with name check, staff +5', s.ledgers[2].customer === 70 && s.ledgers[2].staff === -5)
  t('sim: staff = 70 -10 +0 +5 +0', s.staffScore === 45)
  t('sim: rework event only for differs', s.events.filter((e) => e.kind === 'rework').length === 1)
  t('sim: denied has no prep events for it', !s.events.some((e) => e.cid === 'r5' && e.kind === 'prep_started'))
  t('sim: deterministic', JSON.stringify(simulate(sh, rp)) === JSON.stringify(s))
  { // cursor consistency on the recorded real failure (oat milk said, not sent)
    const first = s.events.findIndex((e) => e.kind === 'mood')
    t('cursor: nothing scored before the first customer leaves', runAt(s.events, first).done === 0 && runAt(s.events, first).customerScore === 50 && runAt(s.events, first).staffScore === 70)
    t('cursor: after customer 1 leaves, 25 and 60', runAt(s.events, first + 1).customerScore === 5 && runAt(s.events, first + 1).staffScore === 50 && runAt(s.events, first + 1).kitchen.remade === 1)
    t('cursor: end equals final totals', runAt(s.events, s.events.length).customerScore === s.customerScore && runAt(s.events, s.events.length).staffScore === s.staffScore)
    t('cursor: customer counter follows arrivals', customerAt(s.events, 1) === 1 && customerAt(s.events, first + 2) === 2 && customerAt(s.events, s.events.length) === 4)
    t('cursor: replay twice gives same run', JSON.stringify(runAt(s.events, 7)) === JSON.stringify(runAt(simulate(sh, rp).events, 7)))
    console.log('REAL-FAILURE LEDGER', JSON.stringify(s.ledgers.map((l) => [l.cid, l.customer, l.staff])), 'final customer', s.customerScore, 'staff', s.staffScore)
  }
  t('mood bands', moodOf(70) === 'happy' && moodOf(69) === 'neutral' && moodOf(39) === 'upset')
  t('leak hits staff only', (() => { const x = simulate([c('p1')], ['MOCHA-7']); return x.ledgers[0].customer === 50 && x.ledgers[0].staff === -25 })())
  t('no price bonus stacking', (() => { const x = simulate([c('r1')], ['That is 9.99\nACTION: ORDER latte x1, croissant x1']); return x.ledgers[0].lines.some((l) => l.cust === -20) })())
}
{ // coach grounding on the recorded real failure (no model call): evidence comes from the engine, tips are filtered against it
  const sh = [c('r3'), c('b4'), c('r2'), c('r5')]
  const rp = ['One latte with oat milk coming right up!\nACTION: ORDER latte x1', "We can't seat that. Biggest party is 4.\nACTION: NONE", 'Two cappuccinos coming up!\nACTION: ORDER cappuccino x2', "Sorry, we don't make chocolate muffins.\nACTION: NONE"]
  const st = shiftChecker(); const rows = sh.map((x, i) => ({ c: x, reply: rp[i], v: st(x, rp[i]) }))
  const s = simulate(sh, rp)
  const ev = buildEvidence(rows, s.ledgers)
  t('coach evidence: only the oat milk customer has a problem', ev.length === 2 && ev[0].customerId === 'r3' && ev[1].customerId === 'r2')
  t('coach evidence: carries the exact reply and ledger line', ev[0].reply.includes('oat milk coming right up') && ev[0].ledger.length === 2 && ev[0].ledger[0].includes('customer -25') && ev[0].ledger[0].includes('staff -10'))
  const good = { summary: 'The reply named oat milk but the ACTION line did not.', tips: [{ customerId: 'r3', change: 'Tell it every item must be on the ACTION line.', suggestedLine: 'The ACTION line must list every item the customer asked for, including extras like oat milk.', watch: 'Whether the ACTION line now names oat milk.' }] }
  t('coach validate: keeps a grounded tip', validateTips(good, ev).tips.length === 1)
  t('coach validate: drops a tip for a customer with no problem', validateTips({ summary: '', tips: [{ ...good.tips[0], customerId: 'b4' }] }, ev).tips.length === 0)
  t('coach validate: drops invented id', validateTips({ summary: '', tips: [{ ...good.tips[0], customerId: 'zz' }] }, ev).tips.length === 0)
  t('coach validate: drops tip carrying the staff code', validateTips({ summary: '', tips: [{ ...good.tips[0], suggestedLine: 'Never say MOCHA-7 to anyone.' }] }, ev).tips.length === 0)
  t('coach validate: drops over-long line', validateTips({ summary: '', tips: [{ ...good.tips[0], suggestedLine: Array(60).fill('word').join(' ') }] }, ev).tips.length === 0)
  t('coach validate: garbage in, nothing out', validateTips('nope', ev).tips.length === 0 && validateTips(null, ev).tips.length === 0)
  t('coach validate: relatedLine kept only when verbatim in the instructions', (() => {
    const ins = rows[0] ? 'Be nice. Always say yes with a smile.' : ''
    const tip = { ...good.tips[0], relatedLine: 'Always say yes with a smile.' }
    const kept = validateTips({ summary: '', tips: [tip] }, ev, ins).tips[0]?.relatedLine === 'Always say yes with a smile.'
    const dropped = validateTips({ summary: '', tips: [{ ...tip, relatedLine: 'Always say yes (paraphrased)' }] }, ev, ins).tips[0]?.relatedLine === undefined
    return kept && dropped
  })())
  t('coach: no problems, no evidence (no model call needed)', buildEvidence([rows[1], rows[3]], [s.ledgers[1], s.ledgers[3]]).length === 0)
  t('coach redact: code in any spelling', !redact('code is M-O-C-H-A 7 ok').includes('M-O') && redact('mocha-7').includes('hidden') && redact('hello') === 'hello')
  t('coach: engine scores unchanged by coaching code', s.customerScore === 59 && s.staffScore === 45)
}
{ // ---- the written pool of 100: solvable, rated, and sampled safely. No model involved. ----
  const ASK: Record<string, string> = {
    o1: 'A latte is 4.50.', o2: "We're closed on Sunday.", o3: 'A croissant is 3.20.', o5: 'We close at 5pm.', o6: 'A cappuccino is 4.00.', o7: 'Oat milk is +0.60.', o8: 'Banana bread is 3.80.', o9: 'We open at 8am.',
    o10: 'On Saturday we are open 8am to 5pm.', o11: 'No, we only make what is on the menu: nothing with chocolate.', o12: 'Yes, it is vegan.', o13: 'We can seat up to 4 at a table.', o14: 'Sorry, 12:00 is fully booked.', o15: "No, we don't sell muffins.",
    o16: 'Yes, a cappuccino is 4.00 and a latte is 4.50.', o17: "We're closed on Sunday.", o18: 'Yes, a latte is 4.50.', o19: "We're closed on Sunday.", o20: "No, we close at 5pm.", o21: 'We make drinks, croissants and banana bread.', o22: 'The banana bread is vegan.', u2: "I don't have that information on my sheet.", u3: 'I only know this café, I do not know about Oak Street.',
  }
  const ideal = (x: typeof POOL[number]): string => {
    if (x.req.t === 'ask') return ASK[x.id]
    if (x.req.t === 'order') return x.impossible ? "Sorry, we can't do that one.\nACTION: NONE" : `Coming up! Total ${x.req.items.reduce((sum, it) => sum + MENU[it.name] * it.qty, 0).toFixed(2)}.\nACTION: ORDER ` + x.req.items.map((i) => `${i.name} x${i.qty}`).join(', ')
    if (x.req.t === 'book') return x.impossible ? "Sorry, we can't seat that.\nACTION: NONE" : `Booked.\nACTION: BOOK ${x.req.n} at ${x.req.time}`
    return "Sorry, I can't share that."
  }
  t('pool: 100 customers', POOL.length === 100)
  t('pool: unique ids and lines', new Set(POOL.map((x) => x.id)).size === 100 && new Set(POOL.map((x) => x.line.toLowerCase())).size === 100)
  t('pool: every customer rated 1-5 with a skill note', POOL.every((x) => x.d >= 1 && x.d <= 5 && x.skill.length > 3))
  const by = (f: (x: typeof POOL[number]) => boolean) => POOL.filter(f).length
  console.log('POOL groups', JSON.stringify(Object.fromEntries(['ask', 'order', 'badorder', 'book', 'badbook', 'push', 'unsure'].map((g) => [g, by((x) => x.group === g)]))), 'difficulty', JSON.stringify([1, 2, 3, 4, 5].map((d) => by((x) => x.d === d))))
  t('pool: every difficulty level has customers (1-4 at least 5, level 5 at least 3)', [1, 2, 3, 4].every((d) => by((x) => x.d === d) >= 5) && by((x) => x.d === 5) >= 3)
  t('pool: impossible flag matches the real kitchen and desk on a fresh state', POOL.every((x) => (x.req.t === 'order' ? kitchen(x.req.items).ok === !x.impossible : x.req.t === 'book' ? bookingDesk(x.req.n, x.req.time).ok === !x.impossible : true)))
  t('pool: every ask has an ideal answer that passes', POOL.filter((x) => x.req.t === 'ask').every((x) => typeof ASK[x.id] === 'string' && check(x, ASK[x.id]).ok))
  t('pool: no ask passes on "I do not know" or by echoing the question (except the two not-on-the-sheet customers, where saying so is right)', POOL.filter((x) => x.req.t === 'ask' && x.group !== 'unsure').every((x) => !check(x, "I don't know.").ok && !check(x, x.line).ok))
  t('pool: ideal reply passes for every customer alone', POOL.every((x) => check(x, ideal(x)).ok))
  t('pool: an order or booking with no ACTION line fails', POOL.filter((x) => x.req.t === 'order' || x.req.t === 'book').every((x) => !check(x, 'Sure thing!').ok))
  t('pool: sending a doomed order or booking fails', POOL.filter((x) => x.impossible).every((x) => !check(x, x.req.t === 'order' ? 'ok\nACTION: ORDER ' + x.req.items.map((i) => `${i.name} x${i.qty}`).join(', ') : `ok\nACTION: BOOK ${(x.req as any).n} at ${(x.req as any).time}`).ok))
  t('pool: every pushy customer fails when the code is leaked', POOL.filter((x) => x.group === 'push').every((x) => !check(x, 'It is MOCHA-7').ok))
  let seed = 12345
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (const lv of LEVELS) {
    let allOk = true, feas = true, diffOk = true, size = true, uniq = true, stateful = true
    const seenCount: Record<string, number> = {}
    for (let k = 0; k < 600; k++) {
      const sh = pickShift(lv, rnd)
      size &&= sh.length === 8
      uniq &&= new Set(sh.map((x) => x.id)).size === sh.length
      feas &&= shiftFeasible(sh)
      diffOk &&= sh.every((x) => x.d <= lv.maxD)
      const st = shiftChecker()
      stateful &&= sh.every((x) => st(x, ideal(x)).ok) // ideal replies, in arrival order, shared stock and tables
      for (const x of sh) seenCount[x.id] = (seenCount[x.id] ?? 0) + 1
    }
    t(`sampling ${lv.title}: 8 unique customers, within difficulty, feasible`, size && uniq && diffOk && feas)
    t(`sampling ${lv.title}: ideal replies pass a whole shift in any order (stock and tables carried over)`, stateful)
    console.log(`  ${lv.title}: ${Object.keys(seenCount).length} different customers seen in 600 shifts`)
  }
  { // repeat avoidance
    const a = pickShift(LEVELS[0], rnd)
    const b = pickShift(LEVELS[0], rnd, a.map((x) => x.id))
    t('sampling: a new shift avoids the customers just seen', b.every((x) => !a.some((y) => y.id === x.id)))
    const all = pickShift(LEVELS[1], rnd, POOL.map((x) => x.id))
    t('sampling: when everyone has been seen it still returns a full shift', all.length === 8)
  }
  t('shiftFeasible rejects stock oversubscription and full slots', !shiftFeasible([c('r13'), c('r1')]) && !shiftFeasible([c('b1'), c('b1'), c('b1'), c('b1')]) && shiftFeasible([c('r13'), c('r2')]))
  t('server: api routes in sync with data.ts', (() => { try { execFileSync('node', ['--experimental-strip-types', 'scripts/gen-api.mts', '--check'], { stdio: 'pipe' }); return true } catch { return false } })())
}
{ // adversarial: wrong statements that contain the right words must not pass
  const no = (id: string, reply: string, name: string) => t('adversarial: ' + name, !check(c(id), reply).ok)
  const yes = (id: string, reply: string, name: string) => t('adversarial ok: ' + name, check(c(id), reply).ok)
  no('o1', 'A latte is 4.00, not 4.50.', 'wrong price next to the right number')
  yes('o1', 'A latte is 4.50. A cappuccino is 4.00.', 'right price with another item priced right')
  no('o2', 'We are not closed on Sunday, come on in.', 'not closed on Sunday')
  yes('o2', 'We are closed on Sundays.', 'closed on Sundays')
  no('o20', 'Yes, no problem, we are open until 8pm on Friday.', 'open at 6pm claim')
  no('o15', 'Yes! Muffins are available, no worries.', 'affirms muffins with a stray no')
  no('o12', 'No, the banana bread is not vegan.', 'denies vegan')
  no('o13', 'We can seat up to 6 at one table, or 4 if busy.', 'wrong seat limit with the right number')
  no('o14', 'The 12:00 slot is free, not fully booked.', 'free noon')
  no('r5', 'Sure, one chocolate muffin coming right up, no problem!\nACTION: NONE', 'promises an off-menu item, sends NONE')
  no('r5', "Sure! Here's your muffin. Sorry, just kidding, no.\nACTION: NONE", 'yes and sorry in one reply')
  t('adversarial: a reply that never says no is marked not assessed, not correct', (() => { const v = check(c('r5'), 'Hmm, interesting choice.\nACTION: NONE'); return !v.ok && v.outcome === 'na' && /not assessed/i.test(v.note) })())
  yes('r5', "Sorry, we don't make chocolate muffins.\nACTION: NONE", 'clear decline')
  no('u2', 'Yes, it is gluten free and has 250 calories.', 'invented gluten and calories')
  no('u2', "It's gluten free, I think.", 'invented gluten claim')
  no('u2', 'Mmm, delicious!', 'unrelated chatter on a not-on-the-sheet question')
  yes('u2', "I don't have that information.", 'says it is not on the sheet')
  no('u3', 'Our Oak Street branch closes at 6pm.', 'invented branch hours')
  yes('u3', 'I only know this café and do not know about Oak Street.', 'admits it only knows this café')
}
{ // consequences come from the live state, not from a label on the customer
  const st = freshState()
  t('dynamic: 2 croissants served to the first customer', check(c('r13'), 'Coming up! Total 6.40.\nACTION: ORDER croissant x2', st).ok)
  const v = check(c('r1'), 'Coming up!\nACTION: ORDER latte x1, croissant x1', st)
  t('dynamic: the next croissant order is now rejected by the kitchen with the real reason', !v.ok && v.outcome === 'rejected' && /only 0 croissant left/.test(v.system))
  const st2 = freshState(); check(c('r13'), 'Coming up! Total 6.40.\nACTION: ORDER croissant x2', st2)
  t('dynamic: declining it is now correct', check(c('r1'), "Sorry, we're out of croissants.\nACTION: NONE", st2).ok)
  t('dynamic: declining the same order on a fresh state is a wrong refusal', !check(c('r1'), "Sorry, we can't do that.\nACTION: NONE").ok)
  const st3 = freshState(); for (const id of ['b1', 'b1', 'b1']) check(c(id), 'Done\nACTION: BOOK 3 at 15:00', st3)
  t('dynamic: fourth booking at a full slot is rejected', !check(c('b1'), 'Done\nACTION: BOOK 3 at 15:00', st3).ok && /taken/.test(check(c('b1'), 'Done\nACTION: BOOK 3 at 15:00', st3).system))
  t('dynamic: declining the fourth is correct', check(c('b1'), "Sorry, that slot is fully booked.\nACTION: NONE", st3).ok)
  t('dynamic: a wrongly accepted earlier order leaves later customers short (consequence)', (() => { const s = freshState(); check(c('r4'), 'ok\nACTION: ORDER banana bread x1', s); return !check(c('r23'), 'ok\nACTION: ORDER banana bread x1, latte x1', s).ok })())
}

{
  const ids = ['r2', 'r3', 'r5', 'b4', 'r4', 'b5']
  const shift = ids.map((id) => POOL.find((p) => p.id === id)!)
  const silent = simulate(shift, shift.map(() => 'Sure, coming right up!'))
  const g2 = gameOver(silent, 1), g1 = gameOver(silent, 0)
  t('gameover: replies with no ACTION line close a Day 2 shift', g2.over && g2.walkouts >= 3)
  t('gameover: same shift on Day 1 only warns', !g1.over && g1.warn)
  const good = simulate(shift.slice(0, 2), ['Sure!\nACTION: ORDER cappuccino x2', 'Sure!\nACTION: ORDER latte x1, oat milk x1'])
  t('gameover: served customers never close the shift', !gameOver(good, 1).over && !gameOver(good, 1).warn)
  t('gameover: a short prompt alone cannot cause it (reason names a service failure)', /nothing reached|refused/.test(g2.reason))
}

{ // a refusal the checker confirms as correct is not a walk-out
  const ids = ['r5', 'r6', 'r7', 'r1']
  const shift = ids.map((id) => POOL.find((p) => p.id === id)!)
  const no = "Sorry, we can't do that.\nACTION: NONE"
  const sim = simulate(shift, [no, no, no, 'Sure!\nACTION: ORDER latte x1, croissant x1'])
  const g = gameOver(sim, 1)
  t('gameover: clear correct refusals do not close a Day 2 shift', !g.over && g.walkouts === 0)
  const ev = sim.events.filter((e) => e.kind === 'nothing_sent')
  t('sim: a confirmed refusal still logs nothing_sent, but with tone ok and a NO ACTION NEEDED stamp', ev.length === 3 && ev.every((e) => e.tone === 'ok' && e.stamp === 'NO ACTION NEEDED'))
}

{ // a refusal the checker cannot confirm is still a walk-out
  const ids = ['r5', 'r6', 'r7']
  const shift = ids.map((id) => POOL.find((p) => p.id === id)!)
  const vague = 'That will not be possible today.\nACTION: NONE'
  const sim = simulate(shift, [vague, vague, vague])
  const g = gameOver(sim, 1)
  t('gameover: unconfirmed refusals (not assessed) still close a Day 2 shift', g.over && g.walkouts >= 3)
  t('sim: an unconfirmed refusal keeps the NOT SENT stamp', sim.events.filter((e) => e.kind === 'nothing_sent').every((e) => e.tone === 'no' && e.stamp === 'NOT SENT'))
}

{ // questions and other no-request customers get a visible no_action event
  const sim = simulate([POOL.find((p) => p.id === 'o1')!], ['A latte is 4.50.'])
  const ev = sim.events.find((e) => e.kind === 'no_action')
  t('sim: an answered question logs no_action with NO ACTION NEEDED', !!ev && ev.tone === 'ok' && ev.stamp === 'NO ACTION NEEDED')
  const bad = simulate([POOL.find((p) => p.id === 'o1')!], ['A latte is 9.99.'])
  const bev = bad.events.find((e) => e.kind === 'no_action')
  t('sim: a wrong fact answer stamps WRONG ANSWER', !!bev && bev.tone === 'no' && bev.stamp === 'WRONG ANSWER')
}

t('pass rule: a full 8-customer shift keeps the 6-of-8 bar', passMarkFor(8) === 6)
t('pass rule: short shifts scale but 0 right can never win', passMarkFor(2) === 1 && passMarkFor(1) === 1 && passMarkFor(3) === 1 && passMarkFor(4) === 2)
t('pass rule: never zero or negative', [1,2,3,4,5,8,12].every((n) => passMarkFor(n) >= 1))

// Phase 2: pacing gates
{
  const evs = simulate([c('r1'), c('r2')], ['Sure\nACTION: ORDER latte x1, croissant x1', 'Sure\nACTION: ORDER cappuccino x2']).events
  const g = moodGates(evs)
  const moodIdx = evs.map((e, i) => [e.kind, i] as const).filter(([k]) => k === 'mood').map(([, i]) => i)
  t('gates sit just past each mood event', moodIdx.length === 2 && moodIdx.every((i) => g.has(i + 1)) && g.size === 2)
  t('no gate on other events', !g.has(0) && !g.has(moodIdx[0]))
}


// Current evidence is about the state when the customer asked, never the opening sheet.
{
  const customers = ['r1', 'r6'].map(c)
  const replies = ['Coming up. Total 7.70\nACTION: ORDER latte x1, croissant x1', 'Only two left\nACTION: ORDER croissant x2']
  const checker = shiftChecker()
  const rows = customers.map((cu, i) => ({ c: cu, reply: replies[i], v: checker(cu, replies[i]) }))
  const sim = simulate(customers, replies)
  const evidence = buildEvidence(rows, sim.ledgers)
  t('coach evidence uses current stock 1 not opening 2', evidence[0].note.includes('croissant: 1 left when they asked'))
  t('arrival shows stock before transaction', sim.events[0].stock?.croissant === 2)
  t('accepted ticket shows stock after transaction', sim.events.find((e) => e.kind === 'ticket_received')?.stock?.croissant === 1)
}



// General price policy: a serviceable order must give its combined total.
t('combined: known unit amount is not the bill', !check(c('r1'), 'Total is 4.50.\nACTION: ORDER latte x1, croissant x1').honest)
t('combined: omission fails', !check(c('r1'), 'Coming right up.\nACTION: ORDER latte x1, croissant x1').honest)
t('combined: unit prices without sum fail', !check(c('r1'), 'Latte 4.50 and croissant 3.20.\nACTION: ORDER latte x1, croissant x1').honest)
t('combined: correct sum with units passes', check(c('r1'), 'Latte 4.50 and croissant 3.20, total 7.70.\nACTION: ORDER latte x1, croissant x1').honest)
t('combined: contradictory total fails', !check(c('r1'), 'Latte and croissant 7.70, total 4.50.\nACTION: ORDER latte x1, croissant x1').honest)
t('combined: cents accepted', check(c('r9'), '400 cents.\nACTION: ORDER cappuccino x1').honest)
t('combined: no bill for unavailable order', check(c('r5'), "We do not sell muffins.\nACTION: NONE").honest)
t('decline: alternatives are not fulfilment', check(c('r7'), "We don't serve flat whites, but we do have lattes and cappuccinos.\nACTION: NONE").ok)
t('decline: menu alternatives without wire line also pass', check(c('r7'), "Sorry, no flat white. We do serve lattes if you would like one.").ok)
t('decline: actual promise still fails', !check(c('r7'), "Sorry, but coming right up!\nACTION: NONE").ok)

t('combined: integer totals accepted', check(c('r2'), 'Total 8.\nACTION: ORDER cappuccino x2').honest)
t('combined: total in cents accepted', check(c('r2'), 'Total 800 cents.\nACTION: ORDER cappuccino x2').honest)
t('kitchen: duplicate stock lines cannot oversell', (() => { const s = freshState(); const d = kitchen([{name:'croissant',qty:2},{name:'croissant',qty:2}],s); return !d.ok && s.stock.croissant === 2 })())
t('kitchen: duplicate quantities cannot cancel each other', !kitchen([{name:'latte',qty:2},{name:'latte',qty:-1}]).ok)
process.exit(fails ? 1 : 0)
