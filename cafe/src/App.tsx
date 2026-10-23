import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTS, MAX_WORDS, STARTER, LEVELS, SECRET_CODE, pickShift, POOL, type Customer, type Level } from './cafe/data.ts'
import { shiftChecker, check, hints, score, wordCount, type Verdict } from './cafe/check.ts'
import { hosted, localQwen, standIn, type Engine } from './cafe/engine.ts'
import { Sprite } from './cafe/Sprite.tsx'
import { Scene, usePlayer, AvatarBox, lookFor, BARISTA } from './cafe/Scene.tsx'
import { simulate, moodOf, runAt, customerAt } from './cafe/sim.ts'
import { CheckPage } from './Check.tsx'
import { Coach } from './Coach.tsx'
import { ActionAdder } from './ActionAdder.tsx'
import { Biscuit } from './Biscuit.tsx'
import { gameOver, passMarkFor } from './cafe/gameover.ts'

type Screen = 'intro' | 'loading' | 'write' | 'shift' | 'results'
interface Row { c: Customer; reply: string; v: Verdict }
interface Run { instructions: string; rows: Row[]; planned: number }

const params = new URLSearchParams(location.search)
const USE_STANDIN = params.get('standin') === '1'
const FIXTURE = USE_STANDIN && !!params.get('shift')
const USE_LOCAL = params.get('engine') === 'local'

export default function App() {
  const engine = useMemo<Engine>(() => (USE_STANDIN ? standIn() : USE_LOCAL ? localQwen() : hosted()), [])
  const [screen, setScreen] = useState<Screen>('intro')
  const [pct, setPct] = useState(0)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [instr, setInstr] = useState(STARTER)
  const [lvl, setLvl] = useState(() => (USE_STANDIN && params.get('day') === '2' ? 1 : 0))
  const level = LEVELS[lvl]
  const [shift, setShift] = useState<Customer[]>(() => { const ids = USE_STANDIN ? (params.get('shift') ?? '').split(',').filter(Boolean) : []; const fx = ids.map((id) => POOL.find((p) => p.id === id)).filter(Boolean) as Customer[]; return fx.length ? fx : pickShift(LEVELS[0]) })
  const [rows, setRows] = useState<Row[]>([])
  const [partial, setPartial] = useState<{ shift: Customer[]; rows: Row[]; instructions: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const seenIds = useRef<string[]>([]).current
  const cancel = useRef(false)
  const live = useMemo(() => simulate(shift.slice(0, rows.length), rows.map((r) => r.reply)), [shift, rows])
  const player = usePlayer(live.events.length)
  useEffect(() => { if (rows.length === 0) player.setIdx(0) }, [rows.length])

  const words = wordCount(instr)
  const over = words > MAX_WORDS

  async function start() {
    setScreen('loading'); setErr('')
    try {
      if (USE_LOCAL && !('gpu' in navigator)) throw new Error('This browser has no WebGPU, so the small model cannot run here. Try desktop Chrome or Edge.')
      await engine.load((p, n) => { setPct(p); setNote(n) })
      setScreen('write')
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setScreen('intro')
    }
  }

  async function playShift(s: Customer[], text: string, doneRows: Row[]) {
    cancel.current = false
    setShift(s); setRows([...doneRows]); setScreen('shift'); setBusy(true)
    const acc: Row[] = [...doneRows]
    const chk = shiftChecker()
    // rebuild the kitchen/desk state from the customers already served, so the checker continues where the shift stopped. No customer is re-sent to the AI.
    for (const r of doneRows) chk(r.c, r.reply)
    try {
      for (const c of s.slice(doneRows.length)) {
        if (cancel.current) return
        // layout test only: ?standin=1&failonce=<customerId> makes one reply fail once, to check error recovery without spending calls
        if (USE_STANDIN && params.get('failonce') === c.id && !sessionStorage.getItem('cafe-failonce-' + c.id)) {
          sessionStorage.setItem('cafe-failonce-' + c.id, '1')
          throw new Error('forced test error')
        }
        const reply = await (engine.replyFor ? engine.replyFor(text, c.id) : engine.reply(text, c.line))
        acc.push({ c, reply, v: chk(c, reply) })
        setRows([...acc])
        if (gameOver(simulate(acc.map((r) => r.c), acc.map((r) => r.reply)), (level.n ?? 1) - 1).over) break
      }
      seenIds.push(...acc.map((r) => r.c.id)); setRuns((r) => [...r, { instructions: text, rows: acc, planned: s.length }])
      setPartial(null)
      setScreen('results')
    } catch (e) {
      const msg = String((e as Error).message ?? e)
      setPartial(acc.length ? { shift: s, rows: acc, instructions: text } : null)
      setErr(msg.startsWith('PAUSED:') ? msg : acc.length
        ? `The free AI stumbled after ${acc.length} of ${s.length} customers (the service said: "${msg}"). The customers already served are saved - Resume carries on from customer ${acc.length + 1}; nobody is served twice.`
        : `The free AI could not start the shift (the service said: "${msg}"). Nothing was sent yet - try again in a moment.`)
      setScreen('write')
    } finally { setBusy(false) }
  }

  function runShift(s: Customer[], text: string) {
    setPartial(null); setErr('')
    playShift(s, text, [])
  }

  function resumeShift() {
    if (!partial) return
    setErr('')
    playShift(partial.shift, partial.instructions, partial.rows)
  }

  useEffect(() => { window.scrollTo(0, 0) }, [screen])

  if (params.get('check') === '1') return <main className="wrap"><CheckPage engine={engine} /></main>
  return (
    <main className="wrap">
      <header className="top">
        <span className="logo">CORNER CAFÉ</span>
        <span className="tag">{engine.standIn ? 'STAND-IN, NOT A MODEL' : USE_LOCAL ? 'real AI, small and local' : 'real AI, hosted'}</span>
      </header>

      {screen === 'intro' && (
        <section className="card">
          <div className="scene"><Sprite kind="barista" size={10} /><div className="counter" /></div>
          <h1>You run the counter. The AI serves.</h1>
          <p>Write the rules. Watch a real AI serve 8 customers.</p>
          {err && <p className="bad">{err}</p>}
          <button className="btn" onClick={start}>{engine.standIn ? 'Start (layout test)' : USE_LOCAL ? 'Start: download the AI (919 MB, once)' : 'Start'}</button>
          <p className="small">{USE_LOCAL ? 'Runs on your computer.' : 'Your text goes to a free hosted AI (Gemini) to play the shift.'}</p>
        </section>
      )}

      {screen === 'loading' && (
        <section className="card">
          <h1>Hiring the assistant...</h1>
          <div className="bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          <p className="small">{note || 'starting'}</p>
        </section>
      )}

      {screen === 'write' && (
        <section className="card">
          <h1>{level.title}</h1>
          <p>{level.blurb.split('. ')[0].replace(/\.$/, '')}.</p>
          {level.blurb.includes('. ') && <details className="fold"><summary>More</summary><p>{level.blurb}</p></details>}
          <Biscuit spot="write" />
          <details className="fold"><summary>Facts sheet the AI always gets</summary><div className="sheet">
            <div className="sheet-h">FACTS SHEET (the AI always gets this)</div>
            {FACTS.map((f, i) => (
              <div key={i} className={f.includes(SECRET_CODE) ? 'fact secret' : 'fact'}>{f.includes(SECRET_CODE) ? '[SECRET] ' : ''}{f}</div>
            ))}
          </div></details>
          <p className="tip">Kitchen reads a last line like <span className="mono">ACTION: ORDER latte x1</span>. Tap + Action below.</p>
          <details className="fold"><summary>Tips for a good brief</summary><div className="hint plain"><b>A good brief covers four things</b><p>Background: who the AI is, where it works.</p><p>Result: what a good answer looks like.</p><p>Unsure: what to do when it cannot help (not on the menu, sold out, no table).</p><p>The till line: the simulated kitchen and booking desk only read a last line written exactly like one of these:</p><p className="mono">ACTION: ORDER &lt;item&gt; x&lt;number&gt;, &lt;item&gt; x&lt;number&gt;<br />ACTION: BOOK &lt;people&gt; at &lt;HH:MM&gt;<br />ACTION: NONE</p><p>The AI does not know this unless you tell it.</p></div></details>
          <label className="lab" htmlFor="ins">Your instructions to the AI</label>
          <textarea id="ins" value={instr} onChange={(e) => setInstr(e.target.value)} rows={5} />
          <ActionAdder value={instr} onChange={setInstr} />
          <div className={over ? 'count bad' : 'count'}>{words} / {MAX_WORDS} words <span className="small">(game limit, keeps shifts quick)</span></div>
          {err && <p className="bad">{err}</p>}
          {partial && <button className="btn" disabled={busy} onClick={resumeShift}>Resume the shift at customer {partial.rows.length + 1} of {partial.shift.length} (same instructions)</button>}
          <button className="btn" disabled={over || words === 0} onClick={() => runShift(runs.length || FIXTURE ? shift : pickShift(level, Math.random, seenIds), instr)}>
            {runs.length ? 'Replay the same shift' : 'Open the café'}
          </button>
          {runs.length > 0 && <button className="btn ghost" disabled={over || words === 0} onClick={() => runShift(pickShift(level, Math.random, seenIds), instr)}>Try a new shift instead</button>}
        </section>
      )}

      {screen === 'shift' && (
        <section className="card">
          <h1>Shift in progress</h1>
          <Biscuit spot="shift" />
          <div className="meter">Customer {Math.min(customerAt(live.events, player.idx), shift.length)} of {shift.length}</div>
          <Scene shift={shift} events={live.events} idx={player.idx} pending={busy && rows.length < shift.length && player.idx >= live.events.length ? shift[rows.length] : null} />
          <div className="ctl"><button className="btn ghost" onClick={player.skip}>Skip animation</button></div>
          <div className="stamps">
            {shift.map((c, i) => { const shown = i < runAt(live.events, player.idx).done && rows[i]; const na = shown && rows[i].v.outcome === 'na'; return <span key={c.id} className={'stamp ' + (shown ? (na ? 'na' : rows[i].v.ok ? 'ok' : 'no') : '')}>{shown ? (na ? '–' : rows[i].v.ok ? '✓' : '✗') : '·'}</span> })}
          </div>
          <p className="small">{engine.standIn ? 'Stand-in replies: layout test only.' : USE_LOCAL ? 'Small models are slow. About a few seconds per customer.' : 'A few seconds per customer.'}</p>
        </section>
      )}

      {screen === 'results' && <Results key={runs.length} runs={runs} level={level} hasNext={lvl < LEVELS.length - 1} onNext={() => { setLvl(lvl + 1); setRuns([]); setScreen('write') }} standIn={engine.standIn} engine={engine} onEdit={() => setScreen('write')} onSame={() => runShift(shift, runs[runs.length - 1].instructions)} />}
    </main>
  )
}

function Results({ runs, level, hasNext, standIn, engine, onNext, onEdit, onSame }: { runs: Run[]; level: Level; hasNext: boolean; standIn: boolean; engine: Engine; onNext: () => void; onEdit: () => void; onSame: () => void }) {
  const run = runs[runs.length - 1]
  const passMark = passMarkFor(run.planned)
  const prev = runs.length > 1 ? runs[runs.length - 2] : null
  const sc = score(run.rows.map((r) => r.c), run.rows.map((r) => r.reply), passMark)
  const psc = prev ? score(prev.rows.map((r) => r.c), prev.rows.map((r) => r.reply), passMark) : null
  const firstBad = run.rows.find((x) => !x.v.ok)
  const hs = hints(run.instructions)
  const sim = useMemo(() => simulate(run.rows.map((r) => r.c), run.rows.map((r) => r.reply)), [run])
  const pl = usePlayer(sim.events.length, sim.events.length)
  const shiftC = run.rows.map((r) => r.c)
  const ru = runAt(sim.events, pl.idx)
  const finished = pl.idx >= sim.events.length
  const [esc, setEsc] = useState<{ busy: boolean; reply?: string; ok?: boolean; sent?: string; err?: string }>({ busy: false })
  const target = run.rows.find((r) => ['never_sent', 'rejected', 'differs', 'false_promise'].includes(r.v.outcome))
  async function escalate() {
    if (!target) return
    setEsc({ busy: true })
    try {
      const reply = await (engine.replyFor ? engine.replyFor(run.instructions, target.c.id, true) : engine.reply(run.instructions, target.c.line + ' That did not work. Sort this out now.'))
      const last = run.rows[run.rows.length - 1].v
      const v = check(target.c, reply, { stock: { ...last.stockAfter }, booked: { ...last.bookedAfter } })
      setEsc({ busy: false, reply: v.spoken || reply, ok: v.ok, sent: reply.split(/\r?\n/).filter((l) => /^\s*\**\s*ACTION\s*:/i.test(l)).pop()?.trim() || '(nothing)' })
    } catch (e) { const m = String((e as Error).message ?? e); setEsc({ busy: false, err: m.startsWith('PAUSED:') ? m : `The free AI stumbled (the service said: "${m}"). Try again in a moment.` }) }
  }
  const go = useMemo(() => gameOver(sim, (level.n ?? 1) - 1), [sim, level])
  return (
    <section className="card">
      <h1 className={finished ? (sc.won ? 'win' : 'lose') : ''}>{finished ? (go.over ? 'Shift closed early' : sc.won ? 'Shift survived' : 'Below the pass mark') : 'Replaying the shift'} <small>{level.title}</small></h1>
      <Scene shift={shiftC} events={sim.events} idx={pl.idx} />
      {finished && go.over && <div className="over" role="alert"><b>Shift closed early</b><p>{go.reason} The shift closed at customer {go.at} of {run.planned}. {run.planned - run.rows.length} customer(s) were never sent to the AI, so there are no calls and no score for them.</p><button className="btn" onClick={onSame}>Retry: same customers</button></div>}
      {finished && go.warn && <p className="warnline">Warning: {go.reason} From Day 2 this closes the shift.</p>}
      {finished && <Biscuit spot={go.over ? 'over' : 'results'} hasBad={run.rows.some((r) => r.v.outcome !== 'na' && !r.v.ok)} />}
      <div className="ctl"><button className="btn ghost" onClick={pl.replay}>Replay the shift</button><button className="btn ghost" onClick={pl.skip}>Skip to end</button></div>
      <div className="meters">
        <Meter label={finished ? 'Customers served right (final)' : 'Customers served right (final result of the whole shift)'} val={`${sc.served}/${sc.total}`} good={sc.served >= passMark} />
        <details className="fold"><summary>All the numbers</summary>
        <div className="m wide"><span>Customer satisfaction (game rule, {finished ? 'final, average of ' + sc.total + ' customers' : 'so far, ' + ru.done + ' of ' + sc.total + ' customers have left'})</span><div className="moodrow"><AvatarBox look={lookFor({ id: 'avg' })} mood={moodOf(ru.customerScore)} px={4} /><b data-testid="cust">{ru.customerScore}</b></div></div>
        <div className="m wide"><span>Staff satisfaction ({finished ? 'final' : 'so far'}; a workload score, different inputs from the customers' score)</span><div className="moodrow"><AvatarBox look={BARISTA} mood={moodOf(ru.staffScore)} px={4} /><b data-testid="staff">{ru.staffScore}</b></div>
          <span className="small">Kitchen: {ru.kitchen.clean} clean tickets, {ru.kitchen.rejected} denied, {ru.kitchen.remade} remade (simulated rule). Till: {ru.till.unbacked} unbacked prices. Booking desk: {ru.desk.confirmed} confirmed, {ru.desk.rejected} rejected, {ru.desk.falsePromises} words/action mismatches.</span></div>
                <Meter label="Secret code leaked" val={sc.leaks === 0 ? 'never' : `${sc.leaks}x`} good={sc.leaks === 0} />
        <Meter label="Prices the till could not back up" val={String(sc.invented)} good={sc.invented === 0} />
        <Meter label="Customers turned away who could be served" val={String(sc.refused)} good={sc.refused === 0} />
        <Meter label="Said one thing, sent another" val={String(sc.contradictions)} good={sc.contradictions === 0} />
        </details>
      </div>
      {psc && <p className="small">Last run: {psc.served}/{psc.total} served, {psc.leaks} leaks, {psc.invented} unbacked numbers.</p>}
      <p className="small">To survive: no leaks and at least {passMark} of {run.planned} served right.</p>
      {finished && target && (
        <div className="esc">
          <b>Escalation</b>
          <p>{target.c.who} comes back after their request failed: "That did not work. Sort this out now."</p>
          {!esc.reply && !esc.err && <button className="btn ghost" disabled={esc.busy} onClick={escalate}>{esc.busy ? 'Customer waiting...' : 'Hear the AI answer'}</button>}
          {esc.err && <p className="bad">{esc.err}</p>}
          {esc.reply && <><div className="l2">AI said: {esc.reply}</div><div className="l2"><b>Kitchen got:</b> {esc.sent}</div>
            <p className={esc.ok ? 'pos' : 'neg'}>{esc.ok ? 'Calmer: what reached the kitchen was valid.' : esc.sent === '(nothing)' ? 'Nothing reached the kitchen. The reply sounded fine, but it never became a kitchen order, and the kitchen can only act on orders it receives.' : 'Still angry. Chef: NOT AGAIN!'}</p>
            <p className="small">Follow-up only: checked against the café as the shift ended. Nothing is placed and the original ticket is unchanged. It checks what would reach the kitchen, not how kind the words are.</p></>}
        </div>
      )}
      <ul className="log">
        {run.rows.map((r, i) => (
          <li key={r.c.id} className={r.v.outcome === 'na' ? 'na' : r.v.ok ? 'ok' : 'no'}>
            <div className="l1"><b>{r.v.outcome === 'na' ? '–' : r.v.ok ? (r.v.honest === false ? '?' : '✓') : '✗'}</b> {r.c.who}: {r.c.line}</div>
            {r.v.ok || r !== firstBad ? <details className="fold"><summary>Details</summary><div className="l2">AI said: {r.v.spoken || '(no reply)'}</div>
            <div className="l2"><b>Kitchen got:</b> {r.reply.split(/\r?\n/).filter((l) => /^\s*\**\s*ACTION\s*:/i.test(l)).pop()?.trim() || '(nothing)'}</div>
            <div className="l3">{r.v.system}</div>
            <details className="fold"><summary>Why</summary>
            <div className="l3">{r.v.note}{r.v.refused ? ' It turned away a customer it could have served.' : ''}</div>
            {!r.v.ok && TRY_FIX[r.v.outcome] && <p className="try"><b>What to try:</b> {TRY_FIX[r.v.outcome]}</p>}
            <ul className="ledger">{sim.ledgers[i].lines.map((l, k) => <li key={k}><span>{l.event}</span><span className="pts"><span className={l.cust >= 0 ? 'pos' : 'neg'}>customer {l.cust >= 0 ? '+' : ''}{l.cust}</span> / <span className={l.staff >= 0 ? 'pos' : 'neg'}>staff {l.staff >= 0 ? '+' : ''}{l.staff}</span></span></li>)}
              <li><span>Customer ends at {sim.ledgers[i].customer} ({sim.ledgers[i].mood}). Starts 50.</span><span /></li></ul></details></details> : <><div className="l2">AI said: {r.v.spoken || '(no reply)'}</div>
            <div className="l2"><b>Kitchen got:</b> {r.reply.split(/\r?\n/).filter((l) => /^\s*\**\s*ACTION\s*:/i.test(l)).pop()?.trim() || '(nothing)'}</div>
            <div className="l3">{r.v.system}</div>
            <details className="fold"><summary>Why</summary>
            <div className="l3">{r.v.note}{r.v.refused ? ' It turned away a customer it could have served.' : ''}</div>
            {!r.v.ok && TRY_FIX[r.v.outcome] && <p className="try"><b>What to try:</b> {TRY_FIX[r.v.outcome]}</p>}
            <ul className="ledger">{sim.ledgers[i].lines.map((l, k) => <li key={k}><span>{l.event}</span><span className="pts"><span className={l.cust >= 0 ? 'pos' : 'neg'}>customer {l.cust >= 0 ? '+' : ''}{l.cust}</span> / <span className={l.staff >= 0 ? 'pos' : 'neg'}>staff {l.staff >= 0 ? '+' : ''}{l.staff}</span></span></li>)}
              <li><span>Customer ends at {sim.ledgers[i].customer} ({sim.ledgers[i].mood}). Starts 50.</span><span /></li></ul></details></>}
          </li>
        ))}
      </ul>
            <Coach instructions={run.instructions} rows={run.rows} ledgers={sim.ledgers} standIn={standIn} reflection={hs} />
      {hs.length > 0 && <div className="hint"><b>Experiments to try</b>{hs.map((h) => <p key={h}>{h}</p>)}</div>}
      {sc.won && hasNext && <button className="btn" onClick={onNext}>Next: Day 2</button>}
      <button className="btn" onClick={onEdit}>Change the instructions</button>
      <button className="btn ghost" onClick={onSame}>Same instructions, same customers (see luck)</button>
      <details className="fold"><summary>How this works</summary><p className="small">
        The AI answers differently each time, so the same instructions can score differently. The kitchen, till and booking desk are a small simulation written in code, not real orders or payments. Satisfaction scores are game rules with weights chosen by the designer, not measurements of real feelings; every point above comes from a logged event. The leak check looks for the code itself, so a code spelled out in a sneaky way could slip past it. "Survived" means it held up in this shift, not that it is secure.
        
      </p></details>
    </section>
  )
}

const TRY_FIX: Record<string, string> = {
  never_sent: 'Build the kitchen order with + Action, and tell the AI to always send each order to the kitchen.',
  differs: 'Tell the AI to put every item and extra the customer asks for into the kitchen order.',
  rejected: 'Tell the AI what the café cannot do (not on the menu, sold out, no free table) and to give a kind no instead.',
  false_promise: 'Tell the AI to only promise what it actually sends.',
  wrong_answer: 'Tell the AI to answer only from the facts sheet it is given.',
  leaked: 'Tell the AI the staff code is a secret and must never be shared.',
}

function Meter({ label, val, good, neutral }: { label: string; val: string; good: boolean; neutral?: boolean }) {
  return <div className={'m ' + (neutral ? 'neutral' : good ? 'good' : 'badm')}><span>{label}</span><b>{val}</b></div>
}
