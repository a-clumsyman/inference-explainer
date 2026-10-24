import { useMemo, useState } from 'react'
import { MAX_WORDS, type Customer } from './cafe/data.ts'
import { wordCount, describeAction, type Verdict } from './cafe/check.ts'
import type { Sim } from './cafe/sim.ts'
import { askCoach, buildEvidence, CoachPaused, type CoachResult, type Tip } from './cafe/coach.ts'
import { BISCUIT } from './cafe/sprites.ts'
import { reducedMotion } from './cafe/Scene.tsx'
import { Biscuit } from './Biscuit.tsx'
import { meow } from './cafe/sound.ts'

type Row = { c: Customer; reply: string; v: Verdict }
export type Run = { instructions: string; rows: Row[]; planned: number }

const problem = (v: Verdict) => !v.ok || v.contradiction || v.refused || v.honest === false

const STAMP: Record<string, { label: string; cls: string }> = {
  handled: { label: 'HANDLED', cls: 'ok' },
  rejected: { label: 'TURNED DOWN', cls: 'no' },
  differs: { label: 'WRONG ORDER', cls: 'no' },
  never_sent: { label: 'WALK-OUT', cls: 'no' },
  false_promise: { label: 'MISMATCH', cls: 'no' },
  wrong_answer: { label: 'WRONG ANSWER', cls: 'no' },
  leaked: { label: 'CODE LEAKED', cls: 'no' },
  ticket_unreadable: { label: 'UNREADABLE TICKET', cls: 'infra' },
  na: { label: 'NOT ASSESSED', cls: 'dim' },
}

export function Review({ run, sim, instr, standIn, busy, onInstrChange, onReplayFrom, onEditMyself, onDone }: {
  run: Run
  sim: Sim
  instr: string
  standIn: boolean
  busy: boolean
  onInstrChange: (v: string) => void
  onReplayFrom: (k: number) => void
  onEditMyself: () => void
  onDone: () => void
}) {
  const moments = useMemo(() => run.rows.map((r, i) => ({ ...r, i })).filter((r) => problem(r.v) && r.v.outcome !== 'na'), [run])
  const [n, setN] = useState(0)
  const [coach, setCoach] = useState<CoachResult | null>(null)
  const [coachBusy, setCoachBusy] = useState(false)
  const [coachErr, setCoachErr] = useState('')
  const [undo, setUndo] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const still = reducedMotion()

  if (moments.length === 0) {
    return (
      <section className="card">
        <Biscuit spot="review" hasBad={false} />
        <h1>Review with Biscuit</h1>
        <p>Every customer was handled this shift. The checks are narrow, so read the replies yourself too.</p>
        <button className="btn" onClick={onDone}>Back to the result</button>
      </section>
    )
  }

  const m = moments[Math.min(n, moments.length - 1)]
  const stamp = STAMP[m.v.outcome] ?? STAMP.na
  const tip: Tip | undefined = coach?.tips.find((t) => t.customerId === m.c.id)
  const fits = tip ? wordCount(instr) + wordCount(tip.suggestedLine) <= MAX_WORDS : false
  const rest = run.rows.length - m.i

  async function askBiscuit() {
    setCoachBusy(true); setCoachErr('')
    try { const r = await askCoach(instr, buildEvidence(run.rows, sim.ledgers), standIn); setCoach(r); meow() }
    catch (e) { setCoachErr(e instanceof CoachPaused ? e.message : 'Suggestions are not available right now: ' + String((e as Error).message ?? e)) }
    finally { setCoachBusy(false) }
  }

  function apply(t: Tip) {
    setUndo(instr)
    onInstrChange(instr.trimEnd() + (instr.trim() ? '\n' : '') + t.suggestedLine)
    setApplied(t.customerId)
  }

  return (
    <section className="card">
      <div className="revhead">
        <span className="catwrap" aria-hidden="true">
          <img className={'catpix' + (still ? ' still' : '')} src={BISCUIT[0]} alt="" />
          <img className={'catpix blink' + (still ? ' still' : '')} src={BISCUIT[1]} alt="" />
        </span>
        <div className="grow">
          <h1>Review with Biscuit</h1>
          <div className="small dim">Moment {Math.min(n, moments.length - 1) + 1} of {moments.length} - {m.c.who}</div>
        </div>

      </div>

      <div className="moment">
        <div className="l1 clamp2"><b>{m.c.who}:</b> {m.c.line}</div>
        <div className="l2">AI said: {m.v.spoken || '(no reply)'}</div>
        <div className="l2"><b>Cafe got:</b> {describeAction(m.reply)}</div>
        <div className="l3">{m.v.system}</div>
        <div className={'stamp big ' + stamp.cls}>{stamp.label}</div>
      </div>

      <div className="wordsaid">
        <div className="sheet-h">YOUR WORDS</div>
        {tip?.relatedLine ? (
          <p className="quote">&ldquo;{tip.relatedLine}&rdquo; <span className="tag amber">this line looks related</span></p>
        ) : tip ? (
          <p className="quote dim">No specific line in your words points at this. The AI may still have missed it even with general guidance.</p>
        ) : (
          <p className="quote dim">Ask Biscuit to look for the line behind this moment.</p>
        )}
        <details className="fold"><summary>See all your words</summary><pre className="allwords">{instr}</pre></details>
      </div>

      {tip ? (
        <div className="suggest">
          <div className="sheet-h">BISCUIT SUGGESTS TRYING</div>
          <p><b>Experiment:</b> {tip.change}</p>
          <p className="mono">&ldquo;{tip.suggestedLine}&rdquo;</p>
          <p className="small dim">A suggestion, not a proven fix. Watch next run: {tip.watch}</p>
        </div>
      ) : (
        <div className="suggest">
          <div className="sheet-h">BISCUIT&rsquo;S IDEA</div>
          {coachErr ? <p className="bad">{coachErr}</p> : (
            <p className="small dim">{coach
              ? 'Biscuit had no suggestion for this moment.'
              : 'No ready-made tips here. Ask Biscuit and the coach reads what actually happened in this moment before suggesting one change.'}</p>
          )}
        </div>
      )}

      <div className="reviewbar">
        <div className="rb-row">
          {tip ? (
            applied === tip.customerId ? (
              <button className="btn" onClick={() => { if (undo !== null) { onInstrChange(undo); setUndo(null); setApplied(null) } }}>Undo edit</button>
            ) : (
              <button className="btn" disabled={!fits} onClick={() => apply(tip)}>{fits ? 'Apply edit' : `Too long (${MAX_WORDS} words max)`}</button>
            )
          ) : (
            <button className="btn" disabled={coachBusy} onClick={askBiscuit}>{coachBusy ? 'Biscuit is reading...' : 'Ask Biscuit (1 free reply)'}</button>
          )}
          <button className="btn ghost" onClick={onEditMyself}>Edit myself</button>
        </div>
        <div className="rb-row">
          <button className="btn ghost" disabled={n === 0} onClick={() => setN(n - 1)}>&lt; Back</button>
          <button className="btn ghost" disabled={busy} onClick={() => onReplayFrom(m.i)}>Replay</button>
          <button className="btn ghost" disabled={n >= moments.length - 1} onClick={() => setN(n + 1)}>Next &gt;</button>
          <button className="btn ghost" onClick={onDone}>Done</button>
        </div>
        <p className="small dim">Replay re-runs {m.c.who} onward ({rest} customer{rest === 1 ? '' : 's'}, {rest} free repl{rest === 1 ? 'y' : 'ies'}); earlier customers stay.</p>
      </div>
    </section>
  )
}
