import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTS, MAX_WORDS, STARTER, CONTRACT, LEVELS, SECRET_CODE, pickShift, POOL, type Customer, type Level } from './cafe/data.ts'
import { shiftChecker, checkedRows, reviewMoments, check, score, wordCount, describeAction, parseReply, type Verdict } from './cafe/check.ts'
import { hosted, localQwen, standIn, type Engine } from './cafe/engine.ts'
import { Scene, usePlayer, AvatarBox, lookFor, BARISTA } from './cafe/Scene.tsx'
import { WAITER, customerSprite } from './cafe/sprites.ts'
import { simulate, moodOf, runAt, customerAt } from './cafe/sim.ts'
import { CheckPage } from './Check.tsx'
import { Biscuit } from './Biscuit.tsx'
import { Review, type Run } from './Review.tsx'
import { gameOver, passMarkFor } from './cafe/gameover.ts'
import { SAVE_KEY, encodeProgress, decodeProgress } from './cafe/save.ts'
import { Story } from './Story.tsx'
import { click, ding, chaChing, bookChime, buzz, fanfare, sad, startMusic, muted as soundMuted, setMuted } from './cafe/sound.ts'

type Screen = 'story' | 'meet' | 'loading' | 'write' | 'shift' | 'review' | 'result'
interface Row { c: Customer; reply: string; v: Verdict; instructions?: string }

const params = new URLSearchParams(location.search)
const USE_STANDIN = params.get('standin') === '1'
const FIXTURE = USE_STANDIN && !!params.get('shift')
const USE_LOCAL = params.get('engine') === 'local'
const storageKey = SAVE_KEY + (USE_STANDIN ? '-layout-test' : USE_LOCAL ? '-local' : '-hosted')
const loadSaved = () => { try { return decodeProgress(localStorage.getItem(storageKey)) } catch { return null } }

export default function App() {
  const [saved] = useState(loadSaved)
  const [saveNotice, setSaveNotice] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const engine = useMemo<Engine>(() => (USE_STANDIN ? standIn() : USE_LOCAL ? localQwen() : hosted()), [])
  const [screen, setScreen] = useState<Screen>((saved?.screen as Screen) ?? (USE_STANDIN ? 'meet' : 'story'))
  const [isMuted, setIsMuted] = useState(soundMuted())
  const [pct, setPct] = useState(0)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [instr, setInstr] = useState(saved?.instr ?? STARTER)
  const [lvl, setLvl] = useState(() => saved?.lvl ?? (USE_STANDIN && params.get('day') === '2' ? 1 : 0))
  const level = LEVELS[lvl]
  const [shift, setShift] = useState<Customer[]>(() => { if (saved) return saved.shift; const ids = USE_STANDIN ? (params.get('shift') ?? '').split(',').filter(Boolean) : []; const fx = ids.map((id) => POOL.find((p) => p.id === id)).filter(Boolean) as Customer[]; return fx.length ? fx : pickShift(LEVELS[0]) })
  const [rows, setRows] = useState<Row[]>((saved?.rows as Row[]) ?? [])
  const [partial, setPartial] = useState<{ shift: Customer[]; rows: Row[]; instructions: string } | null>((saved?.partial as { shift: Customer[]; rows: Row[]; instructions: string }) ?? null)
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<Run[]>((saved?.runs as Run[]) ?? [])
  const [finishedRun, setFinishedRun] = useState<Run | null>(null)
  const seenIds = useRef<string[]>([]).current
  const cancel = useRef(false)
  useEffect(() => {
    // Never persist the built-in facts sheet, account data or a live in-flight request.
    const serialized = encodeProgress({ instr, lvl, screen, shift, rows, runs: runs.map(r => ({ ...r, customers: r.customers ?? r.rows.map(row => row.c) })), partial })
    try {
      if (serialized === null) { localStorage.removeItem(storageKey); setSaveNotice('Not saved: this text looks like it contains a secret. Remove it to save game progress.') }
      else { localStorage.setItem(storageKey, serialized); setSaveNotice('Saved on this browser only.') }
    } catch { setSaveNotice('This browser could not save progress. Keep this tab open.') }
  }, [instr, lvl, screen, shift, rows, runs, partial])
  function resetProgress() {
    if (busy) return
    try { localStorage.removeItem(storageKey) } catch { /* reset still works in memory */ }
    setInstr(STARTER); setLvl(0); setShift(pickShift(LEVELS[0])); setRows([]); setRuns([]); setPartial(null); setFinishedRun(null); setErr(''); setResetOpen(false); setScreen('write')
  }
  const live = useMemo(() => simulate(shift.slice(0, rows.length), rows.map((r) => r.reply), partial?.instructions ?? instr, false, rows.map(r => r.instructions)), [shift, rows, instr, partial])
  const player = usePlayer(live.events, 0)
  // customers whose whole moment has played out on screen; the transcript only shows these,
  // so scene, cards and meter move together, one customer at a time
  const served = useMemo(() => live.events.slice(0, player.idx).filter((e) => e.kind === 'mood').length, [live.events, player.idx])
  // sounds follow the playhead, so a cue always matches what is on screen
  const sounded = useRef(0)
  useEffect(() => {
    if (player.idx <= sounded.current) { sounded.current = player.idx; return }
    for (let i = sounded.current; i < player.idx; i++) {
      const e = live.events[i]
      if (!e) continue
      if (e.kind === 'ticket_received') chaChing()
      else if (e.kind === 'booking_confirmed') bookChime()
      else if (e.kind === 'ticket_denied' || e.kind === 'booking_rejected' || e.kind === 'rework' || e.kind === 'nothing_sent' || e.kind === 'ticket_unreadable') buzz()
      else if (e.kind === 'mood' && e.mood === 'upset') buzz()
      else if (e.kind === 'arrive') ding()
    }
    sounded.current = player.idx
  }, [player.idx, live.events])
  // a new shift (or a resume / replay-from point) rewinds the playhead; customers already
  // served before a resume count as seen, nobody is replayed on screen from zero
  const startAt = useRef(0)
  const [runId, setRunId] = useState(0)
  useEffect(() => {
    const k = startAt.current
    const n = simulate(shift.slice(0, k), rows.slice(0, k).map((r) => r.reply), instr).events.length
    player.setIdx(n)
    sounded.current = n
  }, [runId])
  useEffect(() => { if (rows.length === 0) player.setIdx(0) }, [rows.length])

  const words = wordCount(instr)
  const over = words > MAX_WORDS || instr.length > 2400

  async function start() {
    startMusic()
    setScreen('loading'); setErr('')
    try {
      if (USE_LOCAL && !('gpu' in navigator)) throw new Error('This browser has no WebGPU, so the small model cannot run here. Try desktop Chrome or Edge.')
      await engine.load((p, n) => { setPct(p); setNote(n) })
      setScreen('write')
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setScreen('meet')
    }
  }

  async function playShift(s: Customer[], text: string, doneRows: Row[]) {
    cancel.current = false
    startAt.current = doneRows.length
    setFinishedRun(null); player.resume()
    setRunId((x) => x + 1)
    setShift(s); setRows(checkedRows(doneRows, text)); setScreen('shift'); setBusy(true)
    const acc: Row[] = checkedRows(doneRows, text)
    const chk = shiftChecker(text)
    // rebuild the kitchen/desk state from the customers already served, so the checker continues where the shift stopped. No customer is re-sent to the AI.
    for (const r of doneRows) chk(r.c, r.reply, r.instructions ?? text)
    try {
      for (const c of s.slice(doneRows.length)) {
        if (cancel.current) return
        // layout test only: ?standin=1&failonce=<customerId> makes one reply fail once, to check error recovery without spending calls
        if (USE_STANDIN && params.get('failonce') === c.id && !sessionStorage.getItem('cafe-failonce-' + c.id)) {
          sessionStorage.setItem('cafe-failonce-' + c.id, '1')
          throw new Error('forced test error')
        }
        const reply = await (engine.replyFor ? engine.replyFor(text, c.id, false, acc.length ? { stock: acc[acc.length - 1].v.stockAfter, booked: acc[acc.length - 1].v.bookedAfter } : undefined) : engine.reply(text, c.line))
        acc.push({ c, reply, v: chk(c, reply), instructions: text })
        setRows([...acc])
        if (gameOver(simulate(acc.map((r) => r.c), acc.map((r) => r.reply), text, false, acc.map(r => r.instructions)), (level.n ?? 1) - 1).over) break
      }
      seenIds.push(...acc.map((r) => r.c.id))
      setPartial(null)
      setFinishedRun({ instructions: text, rows: acc, planned: s.length, customers: s })
    } catch (e) {
      const msg = String((e as Error).message ?? e)
      setPartial({ shift: s, rows: acc, instructions: text })
      setErr(msg.startsWith('PAUSED:') ? msg + ` ${acc.length} of ${s.length} customers are saved. Resume continues at customer ${acc.length + 1} with the same instructions.` : acc.length
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

  function replayFrom(k: number) {
    const run = runs[runs.length - 1]
    if (!run) return
    setErr('')
    playShift(run.customers ?? run.rows.map((r) => r.c), instr, run.rows.slice(0, k))
  }

  // Network completion never bypasses the on-screen story. Let the final reaction stay
  // visible, including when the player pauses on it, before opening the result.
  useEffect(() => {
    if (screen !== 'shift' || !finishedRun || busy || player.paused || player.idx < live.events.length) return
    const id = setTimeout(() => {
      setRuns((r) => [...r, finishedRun]); setFinishedRun(null)
      if (gameOver(live, (level.n ?? 1) - 1).over) sad(); else fanfare()
      setScreen('result')
    }, 3400)
    return () => clearTimeout(id)
  }, [screen, finishedRun, busy, player.paused, player.idx, live, level.n])
  useEffect(() => { window.scrollTo(0, 0) }, [screen])

  if (params.get('check') === '1') return <main className="wrap"><CheckPage engine={engine} /></main>
  return (
    <main className="wrap">
      <header className="top">
        <span className="logo">CORNER CAFÉ</span>
        <span className="tag">{engine.standIn ? 'STAND-IN, NOT A MODEL' : USE_LOCAL ? 'real AI, small and local' : 'real AI, hosted'}</span>
        <button type="button" className="soundbtn" aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'} onClick={() => { const m = !isMuted; setMuted(m); setIsMuted(m); if (!m) click() }}>{isMuted ? '\u{1F507}' : '\u{1F50A}'}</button>
      </header>
      <div className="small" role="status">Game text and progress only. Don't enter passwords or personal secrets. {saveNotice} <button className="mini" disabled={busy} onClick={() => setResetOpen(true)}>Reset progress</button></div>
      {resetOpen && <section className="card"><p>Reset saved instructions and all game progress on this browser? This cannot be undone.</p><button className="btn" onClick={resetProgress}>Reset everything</button><button className="btn ghost" onClick={() => setResetOpen(false)}>Keep my progress</button></section>}

      {screen === 'story' && (
        <Story startLabel="Start" onStart={() => { click(); startMusic(); setScreen('meet') }} />
      )}

      {screen === 'meet' && (
        <section className="card meet">
          <div className="meetstage" aria-hidden="true">
            <img src={WAITER.stand} alt="" />
            <img src={customerSprite('r1')} alt="" />
            <img src={customerSprite('b2')} alt="" />
          </div>
          <h1>You write the rules. The AI works the counter.</h1>
          {err && <p className="bad">{err}</p>}
          <button className="btn" onClick={start}>{engine.standIn ? 'Play (layout test)' : USE_LOCAL ? 'Play: download the AI (919 MB, once)' : 'Play'}</button>
          <p className="small">{USE_LOCAL ? 'Runs on your computer.' : 'Your words go to a free hosted AI (Gemini) to play the shift.'} A game by Clumsyman. Art: Kenney + OpenGameArt, CC0.</p>
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
          <Biscuit spot="write" />
          <p className="chip">The cafe turns answers into orders by itself. Your words shape how the AI treats people.</p>
          <details className="fold"><summary>What the cafe adds on its own</summary>
            <p className="small">Always added by the game, never your job to write:</p>
            <p className="mono small">{CONTRACT}</p>
            <details className="fold"><summary>Facts sheet the AI always gets</summary><div className="sheet">
              <div className="sheet-h">FACTS SHEET (the AI always gets this)</div>
              {FACTS.map((f, i) => (
                <div key={i} className={f.includes(SECRET_CODE) ? 'fact secret' : 'fact'}>{f.includes(SECRET_CODE) ? '[SECRET] ' : ''}{f}</div>
              ))}
            </div></details>
          </details>
          <label className="lab" htmlFor="ins">Your instructions to the AI</label>
          <textarea id="ins" maxLength={2400} value={instr} onChange={(e) => setInstr(e.target.value)} rows={5} />
          <div className={over ? 'count bad' : 'count'}>{words} / {MAX_WORDS} words <span className="small">(game limit, keeps shifts quick)</span></div>
          {err && <p className="bad">{err}</p>}
          {partial && <button className="btn" disabled={busy} onClick={resumeShift}>Resume the shift at customer {partial.rows.length + 1} of {partial.shift.length} (same instructions)</button>}
          <button className="btn" disabled={over || words === 0} onClick={() => runShift(runs.length || FIXTURE ? shift : pickShift(level, Math.random, seenIds), instr)}>
            {runs.length ? 'Replay the same shift' : 'Open the cafe'}
          </button>
          {runs.length > 0 && <button className="btn ghost" disabled={over || words === 0} onClick={() => runShift(pickShift(level, Math.random, seenIds), instr)}>Try a new shift instead</button>}
        </section>
      )}

      {screen === 'shift' && (
        <section className="card">
          <h1>The shift</h1>
          <Biscuit spot="shift" />
          <div className="meter">Customer {Math.min(busy && player.idx >= live.events.length ? rows.length + 1 : customerAt(live.events, player.idx), shift.length)} of {shift.length}</div>
          <Scene shift={shift} events={live.events} idx={player.idx} pending={busy && rows.length < shift.length && player.idx >= live.events.length ? shift[rows.length] : null} />
          <div className="ctl">
            {(player.idx < live.events.length || finishedRun) && (player.paused
              ? <button className="btn" onClick={player.resume}>Resume ▸</button>
              : <button className="btn ghost" onClick={player.pause}>Pause</button>)}
            {player.idx < live.events.length && <button className="btn ghost" onClick={player.next}>Next beat ▸</button>}
            {player.idx < live.events.length && <button className="btn ghost" onClick={player.skip}>Skip animation</button>}
          </div>
          <ul className="cards">
            {rows.slice(0, served).map((r) => {
              const short = r.v.system.split(' Till:')[0]
              const kind = r.v.action.t === 'book' ? 'booking' : r.v.action.t === 'order' ? 'order' : 'answer'
              const stamp = r.v.infra ? (r.v.outcome === 'na' ? 'NEEDS A HUMAN LOOK' : 'SYSTEM STUMBLE') : r.v.priceIssue ? (r.v.priceIssue === 'missing_total' ? 'NO TOTAL GIVEN' : r.v.priceIssue === 'wrong_total' ? 'PRICE MISMATCH' : 'INCORRECT PRICE') : r.v.outcome === 'handled' ? (r.v.action.t === 'book' ? 'BOOKED' : r.v.action.t === 'order' ? 'SERVED' : 'ANSWERED') : r.v.outcome === 'ticket_unreadable' ? 'UNREADABLE TICKET' : r.v.outcome === 'na' ? 'NOT ASSESSED' : 'NEEDS A LOOK'
              return (
                <li key={r.c.id} className={'sumcard ' + (r.v.ok ? 'ok' : r.v.infra ? 'infra' : 'no')}>
                  <details>
                    <summary><span className="t"><b>{r.c.who}</b> · {kind}</span><span className="stamp">{stamp}</span></summary>
                    <div className="l2">{r.c.line}</div>
                    <div className="l2">AI said: {r.v.spoken || '(no reply)'}</div>
                    <div className="l3">{short}</div>
                    <details className="fold"><summary>Play-by-play</summary>
                      <ul className="ledger">{live.events.filter((e) => e.cid === r.c.id && e.kind !== 'mood').map((e, k) => <li key={k}>{e.text}</li>)}</ul>
                    </details>
                  </details>
                </li>
              )
            })}
            {busy && player.idx >= live.events.length && rows.length < shift.length && <li className="sumcard run">Thinking about customer {served + 1} of {shift.length}...</li>}
          </ul>
          <p className="small">{engine.standIn ? 'Stand-in replies: layout test only.' : 'Each customer plays out step by step. Pause any time.'}</p>
        </section>
      )}

      {screen === 'review' && runs.length > 0 && (
        <Review
          run={runs[runs.length - 1]}
          sim={simulate(runs[runs.length - 1].rows.map((r) => r.c), runs[runs.length - 1].rows.map((r) => r.reply), runs[runs.length - 1].instructions, false, runs[runs.length - 1].rows.map(r => r.instructions))}
          instr={instr}
          standIn={!!engine.standIn}
          busy={busy}
          onInstrChange={setInstr}
          onReplayFrom={replayFrom}
          onEditMyself={() => setScreen('write')}
          onDone={() => setScreen('result')}
        />
      )}

      {screen === 'result' && runs.length > 0 && (
        <Result key={runs.length} runs={runs} level={level} hasNext={lvl < LEVELS.length - 1} engine={engine} onNext={() => { setLvl(lvl + 1); setRuns([]); setScreen('write') }} onEdit={() => setScreen('write')} onReview={() => setScreen('review')} onSame={() => runShift(shift, runs[runs.length - 1].instructions)} />
      )}
    </main>
  )
}

function Result({ runs, level, hasNext, engine, onNext, onEdit, onReview, onSame }: { runs: Run[]; level: Level; hasNext: boolean; engine: Engine; onNext: () => void; onEdit: () => void; onReview: () => void; onSame: () => void }) {
  const run = runs[runs.length - 1]
  const assessed = run.rows.filter(r => !r.v.infra).length
  const passMark = passMarkFor(assessed)
  const prev = runs.length > 1 ? runs[runs.length - 2] : null
  const sc = score(run.rows.map((r) => r.c), run.rows.map((r) => r.reply), passMark, run.instructions, false, run.rows.map(r => r.instructions))
  const psc = prev ? score(prev.rows.map((r) => r.c), prev.rows.map((r) => r.reply), passMark, prev.instructions, false, prev.rows.map(r => r.instructions)) : null
  const sim = useMemo(() => simulate(run.rows.map((r) => r.c), run.rows.map((r) => r.reply), run.instructions, false, run.rows.map(r => r.instructions)), [run])
  const pl = usePlayer(sim.events, sim.events.length)
  const shiftC = run.rows.map((r) => r.c)
  const ru = runAt(sim.events, pl.idx)
  const [esc, setEsc] = useState<{ busy: boolean; reply?: string; ok?: boolean; sent?: string; nothing?: boolean; err?: string }>({ busy: false })
  const target = run.rows.find((r) => ['never_sent', 'rejected', 'differs', 'false_promise'].includes(r.v.outcome))
  async function escalate() {
    if (!target) return
    setEsc({ busy: true })
    try {
      const last = run.rows[run.rows.length - 1].v
      const reply = await (engine.replyFor ? engine.replyFor(run.instructions, target.c.id, true, { stock: last.stockAfter, booked: last.bookedAfter }) : engine.reply(run.instructions, target.c.line + ' That did not work. Sort this out now.'))
      const v = check(target.c, reply, { stock: { ...last.stockAfter }, booked: { ...last.bookedAfter } }, run.instructions)
      setEsc({ busy: false, reply: v.spoken || reply, ok: v.ok, sent: describeAction(reply), nothing: parseReply(reply).action.t === 'missing' })
    } catch (e) { const m = String((e as Error).message ?? e); setEsc({ busy: false, err: m.startsWith('PAUSED:') ? m : `The free AI stumbled (the service said: "${m}"). Try again in a moment.` }) }
  }
  const go = useMemo(() => gameOver(sim, (level.n ?? 1) - 1), [sim, level])
  const badCount = reviewMoments(checkedRows(run.rows, run.instructions)).length
  return (
    <section className="card">
      <h1 className={sc.won ? 'win' : 'lose'}>{sc.total === 0 ? 'No guests scored yet' : go.over ? 'Shift closed early' : sc.won ? 'Shift survived' : 'Below the pass mark'} <small>{level.title}</small></h1>
      <p>{sc.won ? `${sc.served} of ${sc.total} served right.` : `${sc.served} of ${sc.total} served right - ${badCount} moment${badCount === 1 ? '' : 's'} to look at.`}{sc.unreadable > 0 ? ` (${sc.unreadable} system or unsure-wording moment${sc.unreadable === 1 ? '' : 's'}, not scored.)` : ''}</p>
      <Scene shift={shiftC} events={sim.events} idx={pl.idx} />
      {go.over && <div className="over" role="alert"><b>Shift closed early</b><p>{go.reason} The shift closed at customer {go.at} of {run.planned}. {run.planned - run.rows.length} customer(s) were never sent to the AI, so there are no calls and no score for them.</p><button className="btn" onClick={onSame}>Retry: same customers</button></div>}
      {!go.over && go.warn && <p className="warnline">Warning: {go.reason} From Day 2 this closes the shift.</p>}
      <div className="btnrow">
        {badCount > 0
          ? <button className="btn" onClick={onReview}>Review with Biscuit ({badCount})</button>
          : sc.won && hasNext
            ? <button className="btn" onClick={onNext}>Start the next day</button>
            : <button className="btn" onClick={onSame}>Play this day again</button>}
      </div>
      <details className="fold"><summary>More choices</summary>
        <div className="btnrow col">
          {badCount > 0 && sc.won && hasNext && <button className="btn ghost" onClick={onNext}>Skip the review: start the next day</button>}
          {badCount === 0 && <button className="btn ghost" onClick={onReview}>Open the review anyway</button>}
          <button className="btn ghost" onClick={onSame}>Same words, same customers (see luck)</button>
          <button className="btn ghost" onClick={onEdit}>Change the words</button>
        </div>
      </details>
      <details className="fold"><summary>All the numbers</summary>
        <div className="meters">
          <Meter label="Customers served right" val={`${sc.served}/${sc.total}`} good={sc.served >= passMark} />
          <div className="m wide"><span>Customer satisfaction (game rule, average of {sc.total} customers)</span><div className="moodrow"><AvatarBox look={lookFor({ id: 'avg' })} mood={moodOf(ru.customerScore)} px={4} /><b data-testid="cust">{ru.customerScore}</b></div></div>
          <div className="m wide"><span>Staff satisfaction (a workload score, different inputs from the customers' score)</span><div className="moodrow"><AvatarBox look={BARISTA} mood={moodOf(ru.staffScore)} px={4} /><b data-testid="staff">{ru.staffScore}</b></div>
            <span className="small">Kitchen: {ru.kitchen.clean} clean tickets, {ru.kitchen.rejected} denied, {ru.kitchen.remade} remade, {ru.kitchen.falsePromises} words/action mismatches. Till: {ru.till.unbacked} price/total issues. Booking desk: {ru.desk.confirmed} confirmed, {ru.desk.rejected} rejected, {ru.desk.falsePromises} words/action mismatches.</span></div>
          <Meter label="Secret code leaked" val={sc.leaks === 0 ? 'never' : `${sc.leaks}x`} good={sc.leaks === 0} />
          <Meter label="Missing or incorrect prices/totals" val={String(sc.invented)} good={sc.invented === 0} />
          <Meter label="Customers turned away who could be served" val={String(sc.refused)} good={sc.refused === 0} />
          <Meter label="Said one thing, sent another" val={String(sc.contradictions)} good={sc.contradictions === 0} />
        </div>
        {psc && <p className="small">Last run: {psc.served}/{psc.total} served, {psc.leaks} leaks, {psc.invented} price/total issues.</p>}
        <p className="small">To survive: no leaks and at least {passMark} of {sc.total} assessed guests served right.</p>
      </details>
      <details className="fold"><summary>Every customer, in detail</summary>
        <ul className="log">
          {run.rows.map((r, i) => (
            <li key={r.c.id} className={r.v.outcome === 'na' ? 'na' : r.v.ok ? 'ok' : r.v.infra ? 'na' : 'no'}>
              <div className="l1"><b>{r.v.outcome === 'na' ? '–' : r.v.infra ? '≈' : r.v.ok ? (r.v.honest === false ? '?' : '✓') : '✗'}</b> {r.c.who}: {r.c.line}</div>
              <div className="l2">AI said: {r.v.spoken || '(no reply)'}</div>
              <div className="l2"><b>Cafe got:</b> {describeAction(r.reply)}</div>
              <div className="l3">{r.v.system}</div>
              <details className="fold"><summary>Why</summary>
                <div className="l3">{r.v.note}{r.v.refused ? ' It turned away a customer it could have served.' : ''}</div>
                <ul className="ledger">{sim.ledgers[i].lines.map((l, k) => <li key={k}><span>{l.event}</span><span className="pts"><span className={l.cust >= 0 ? 'pos' : 'neg'}>customer {l.cust >= 0 ? '+' : ''}{l.cust}</span> / <span className={l.staff >= 0 ? 'pos' : 'neg'}>staff {l.staff >= 0 ? '+' : ''}{l.staff}</span></span></li>)}
                  <li><span>Customer ends at {sim.ledgers[i].customer} ({sim.ledgers[i].mood}). Starts 50.</span><span /></li></ul>
              </details>
            </li>
          ))}
        </ul>
      </details>
      {target && (
        <details className="fold"><summary>One customer comes back (escalation, uses 1 free reply)</summary>
          <div className="esc">
            <p>{target.c.who} comes back after their request failed: "That did not work. Sort this out now."</p>
            {!esc.reply && !esc.err && <button className="btn ghost" disabled={esc.busy} onClick={escalate}>{esc.busy ? 'Customer waiting...' : 'Hear the AI answer'}</button>}
            {esc.err && <p className="bad">{esc.err}</p>}
            {esc.reply && <><div className="l2">AI said: {esc.reply}</div><div className="l2"><b>Cafe got:</b> {esc.sent}</div>
              <p className={esc.ok ? 'pos' : 'neg'}>{esc.ok ? 'Calmer: what reached the cafe was valid.' : esc.nothing ? 'Nothing reached the cafe system. The reply sounded fine, but it never became an order.' : 'Still angry. Chef: NOT AGAIN!'}</p>
              <p className="small">Follow-up only: checked against the cafe as the shift ended. Nothing is placed and the original ticket is unchanged.</p></>}
          </div>
        </details>
      )}
      <details className="fold"><summary>How this works</summary><p className="small">
        The AI answers differently each time, so the same instructions can score differently. The kitchen, till and booking desk are a small simulation written in code, not real orders or payments. Satisfaction scores are game rules with weights chosen by the designer, not measurements of real feelings; every point above comes from a logged event. The leak check looks for the code itself, so a code spelled out in a sneaky way could slip past it. "Survived" means it held up in this shift, not that it is secure.
        Cafe art: Kenney (kenney.nl) and OpenGameArt, CC0 - see src/cafe/assets/ATTRIBUTION.md.
      </p></details>
    </section>
  )
}

function Meter({ label, val, good, neutral }: { label: string; val: string; good: boolean; neutral?: boolean }) {
  return <div className={'m ' + (neutral ? 'neutral' : good ? 'good' : 'badm')}><span>{label}</span><b>{val}</b></div>
}
