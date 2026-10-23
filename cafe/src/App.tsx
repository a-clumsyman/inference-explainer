import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTS, MAX_WORDS, PASS_SERVED, STARTER, LEVELS, SECRET_CODE, pickShift, type Customer, type Level } from './cafe/data.ts'
import { shiftChecker, hints, score, wordCount, type Verdict } from './cafe/check.ts'
import { hosted, localQwen, standIn, type Engine } from './cafe/engine.ts'
import { Sprite } from './cafe/Sprite.tsx'
import { CheckPage } from './Check.tsx'

type Screen = 'intro' | 'loading' | 'write' | 'shift' | 'results'
interface Row { c: Customer; reply: string; v: Verdict }
interface Run { instructions: string; rows: Row[] }

const params = new URLSearchParams(location.search)
const USE_STANDIN = params.get('standin') === '1'
const USE_LOCAL = params.get('engine') === 'local'

export default function App() {
  const engine = useMemo<Engine>(() => (USE_STANDIN ? standIn() : USE_LOCAL ? localQwen() : hosted()), [])
  const [screen, setScreen] = useState<Screen>('intro')
  const [pct, setPct] = useState(0)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [instr, setInstr] = useState(STARTER)
  const [lvl, setLvl] = useState(0)
  const level = LEVELS[lvl]
  const [shift, setShift] = useState<Customer[]>(() => pickShift(LEVELS[0]))
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])
  const cancel = useRef(false)

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

  async function runShift(s: Customer[], text: string) {
    cancel.current = false
    setShift(s); setRows([]); setScreen('shift'); setBusy(true)
    const acc: Row[] = []
    const chk = shiftChecker()
    try {
      for (const c of s) {
        if (cancel.current) return
        const reply = await (engine.replyFor ? engine.replyFor(text, c.id) : engine.reply(text, c.line))
        acc.push({ c, reply, v: chk(c, reply) })
        setRows([...acc])
      }
      setRuns((r) => [...r, { instructions: text, rows: acc }])
      setScreen('results')
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setScreen('write')
    } finally { setBusy(false) }
  }

  const cur = rows.length < shift.length ? shift[rows.length] : null
  const last = rows[rows.length - 1]
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
          <p>You cannot talk to customers yourself. You write the rules, then watch a real AI follow them for one shift.</p>
          <ul className="how">
            <li><b>1</b> Write the AI's instructions.</li>
            <li><b>2</b> 8 customers order food, book tables or ask questions. A simulated kitchen and booking desk checks what your AI sends.</li>
            <li><b>3</b> See what held up. Fix it. Run it again.</li>
          </ul>
          {err && <p className="bad">{err}</p>}
          <button className="btn" onClick={start}>{engine.standIn ? 'Start (layout test)' : USE_LOCAL ? 'Start: download the AI (919 MB, once)' : 'Start'}</button>
          <p className="small">{USE_LOCAL ? 'The AI runs on your computer. Nothing you type leaves it.' : 'Your instructions are sent to a hosted AI model (Google Gemini, free tier) to play the shift. Only the game text goes, nothing else.'}</p>
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
          <p>{level.blurb}</p>
          <div className="sheet">
            <div className="sheet-h">FACTS SHEET (the AI always gets this)</div>
            {FACTS.map((f, i) => (
              <div key={i} className={f.includes(SECRET_CODE) ? 'fact secret' : 'fact'}>{f.includes(SECRET_CODE) ? '[SECRET] ' : ''}{f}</div>
            ))}
          </div>
          <div className="hint"><b>A good brief covers four things</b><p>Background: who the AI is, where it works.</p><p>Result: what a good answer looks like.</p><p>Unsure: what to do when it cannot help (not on the menu, sold out, no table).</p><p>The till line: the simulated kitchen and booking desk only read a last line written exactly like one of these:</p><p className="mono">ACTION: ORDER &lt;item&gt; x&lt;number&gt;, &lt;item&gt; x&lt;number&gt;<br />ACTION: BOOK &lt;people&gt; at &lt;HH:MM&gt;<br />ACTION: NONE</p><p>The AI does not know this unless you tell it.</p></div>
          <label className="lab" htmlFor="ins">Your instructions to the AI</label>
          <textarea id="ins" value={instr} onChange={(e) => setInstr(e.target.value)} rows={5} />
          <div className={over ? 'count bad' : 'count'}>{words} / {MAX_WORDS} words <span className="small">(game limit, keeps shifts quick)</span></div>
          {err && <p className="bad">{err}</p>}
          <button className="btn" disabled={over || words === 0} onClick={() => runShift(runs.length ? shift : pickShift(level), instr)}>
            {runs.length ? 'Replay the same shift' : 'Open the café'}
          </button>
          {runs.length > 0 && <button className="btn ghost" disabled={over || words === 0} onClick={() => runShift(pickShift(level), instr)}>Try a new shift instead</button>}
        </section>
      )}

      {screen === 'shift' && (
        <section className="card">
          <h1>Shift in progress</h1>
          <div className="meter">Customer {Math.min(rows.length + 1, shift.length)} of {shift.length}</div>
          <div className="stage">
            <div className="who">{cur ? <Sprite kind={cur.kind === 'ordinary' ? 'ordinary' : cur.kind} /> : null}</div>
            <div className="bubbles">
              {cur && <div className="bubble cust"><small>{cur.who}</small>{cur.line}</div>}
              <div className="bubble ai"><small>Your AI</small>{busy && cur ? <span className="dots">thinking</span> : last?.reply}</div>
            </div>
          </div>
          <div className="stamps">
            {shift.map((c, i) => <span key={c.id} className={'stamp ' + (rows[i] ? (rows[i].v.ok ? 'ok' : 'no') : '')}>{rows[i] ? (rows[i].v.ok ? '✓' : '✗') : '·'}</span>)}
          </div>
          <p className="small">{engine.standIn ? 'Stand-in replies: layout test only.' : USE_LOCAL ? 'Small models are slow. About a few seconds per customer.' : 'A few seconds per customer.'}</p>
        </section>
      )}

      {screen === 'results' && <Results runs={runs} level={level} hasNext={lvl < LEVELS.length - 1} onNext={() => { setLvl(lvl + 1); setRuns([]); setScreen('write') }} onEdit={() => setScreen('write')} onSame={() => runShift(shift, runs[runs.length - 1].instructions)} />}
    </main>
  )
}

function Results({ runs, level, hasNext, onNext, onEdit, onSame }: { runs: Run[]; level: Level; hasNext: boolean; onNext: () => void; onEdit: () => void; onSame: () => void }) {
  const run = runs[runs.length - 1]
  const passMark = Math.min(PASS_SERVED, run.rows.length - 2)
  const prev = runs.length > 1 ? runs[runs.length - 2] : null
  const sc = score(run.rows.map((r) => r.c), run.rows.map((r) => r.reply), passMark)
  const psc = prev ? score(prev.rows.map((r) => r.c), prev.rows.map((r) => r.reply), passMark) : null
  const hs = hints(run.instructions)
  return (
    <section className="card">
      <h1 className={sc.won ? 'win' : 'lose'}>{sc.won ? 'Shift survived' : 'Shift failed'} <small>{level.title}</small></h1>
      <div className="meters">
        <Meter label="Customers served right" val={`${sc.served}/${sc.total}`} good={sc.served >= passMark} />
        <Meter label="Secret code leaked" val={sc.leaks === 0 ? 'never' : `${sc.leaks}x`} good={sc.leaks === 0} />
        <Meter label="Prices the till could not back up" val={String(sc.invented)} good={sc.invented === 0} />
        <Meter label="Customers turned away who could be served" val={String(sc.refused)} good={sc.refused === 0} />
        <Meter label="Said one thing, sent another" val={String(sc.contradictions)} good={sc.contradictions === 0} />
      </div>
      {psc && <p className="small">Last run: {psc.served}/{psc.total} served, {psc.leaks} leaks, {psc.invented} unbacked numbers.</p>}
      <p className="small">To survive: no leaks and at least {Math.min(PASS_SERVED, sc.total - 2)} of {sc.total} served right.</p>
      <ul className="log">
        {run.rows.map((r) => (
          <li key={r.c.id} className={r.v.ok ? 'ok' : 'no'}>
            <div className="l1"><b>{r.v.ok ? (r.v.honest === false ? '?' : '✓') : '✗'}</b> {r.c.who}: {r.c.line}</div>
            <div className="l2">AI said: {r.v.spoken || '(no reply)'}</div>
            <div className="l2">AI sent to the café system: {r.reply.split(/\r?\n/).filter((l) => /^\s*\**\s*ACTION\s*:/i.test(l)).pop()?.trim() || '(nothing)'}</div>
            <div className="l3">Simulated café: {r.v.system}</div>
            <div className="l3">{r.v.note}{r.v.refused ? ' It turned away a customer it could have served.' : ''}</div>
          </li>
        ))}
      </ul>
      <p className="small">The list above is what happened. We cannot see why the AI answered each way.</p>
      {hs.length > 0 && <div className="hint"><b>Experiments to try</b>{hs.map((h) => <p key={h}>{h}</p>)}</div>}
      {sc.won && hasNext && <button className="btn" onClick={onNext}>Next: Day 2</button>}
      <button className="btn" onClick={onEdit}>Change the instructions</button>
      <button className="btn ghost" onClick={onSame}>Same instructions, same customers (see luck)</button>
      <p className="small">
        The AI answers differently each time, so the same instructions can score differently. The kitchen, till and booking desk are a small simulation written in code, not real orders or payments. The leak check looks for the code itself, so a code spelled out in a sneaky way could slip past it. "Survived" means it held up in this shift, not that it is secure.
        
      </p>
    </section>
  )
}

function Meter({ label, val, good, neutral }: { label: string; val: string; good: boolean; neutral?: boolean }) {
  return <div className={'m ' + (neutral ? 'neutral' : good ? 'good' : 'badm')}><span>{label}</span><b>{val}</b></div>
}
