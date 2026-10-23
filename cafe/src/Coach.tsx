import { useState } from 'react'
import { askCoach, buildEvidence, CoachPaused, type CoachResult, type Evidence } from './cafe/coach.ts'
import type { Customer } from './cafe/data.ts'
import type { Verdict } from './cafe/check.ts'
import type { Ledger } from './cafe/sim.ts'

type Row = { c: Customer; reply: string; v: Verdict }

export function Coach({ instructions, rows, ledgers, standIn, reflection }: { instructions: string; rows: Row[]; ledgers: Ledger[]; standIn: boolean; reflection: string[] }) {
  const evidence: Evidence[] = buildEvidence(rows, ledgers)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<CoachResult | null>(null)
  const [err, setErr] = useState('')

  async function go() {
    setOpen(true); if (res || busy) return
    if (!evidence.length) return
    setBusy(true); setErr('')
    try { setRes(await askCoach(instructions, evidence, standIn)) } catch (e) { setErr(e instanceof CoachPaused ? e.message : 'Tips are not available right now: ' + String((e as Error).message ?? e)) } finally { setBusy(false) }
  }

  return (
    <div className="coach">
      <button className="btn" data-testid="coach-btn" onClick={go} disabled={busy}>{busy ? 'Reading your shift...' : 'AI help & tips'}</button>
      {open && !evidence.length && <div className="hint"><b>Nothing failed the game's checks</b><p className="small">The checks are narrow, so this does not mean every reply was good. Read the AI's words above yourself. Ideas to try next (no AI call used):</p><p>Run "Same instructions, same customers" and see whether the result holds or was luck.</p>{reflection.map((h) => <p key={h}>{h}</p>)}</div>}
      {open && err && <p className="bad">{err}</p>}
      {open && res && (
        <div className="hint" data-testid="coach-out">
          <b>AI help &amp; tips</b>
          <p className="small">{standIn ? 'STAND-IN text, not a model. ' : 'Written by the free hosted AI from your instructions and this shift. '}These are ideas to try, not guaranteed fixes. Your instructions are never changed by this page. Copy a line yourself if you want it.</p>
          {res.summary && <p>{res.summary}</p>}
          {res.tips.length === 0 && <p className="small">No usable tips came back. Press the button again, or use the experiments below.</p>}
          {res.tips.map((t) => {
            const e = evidence.find((x) => x.customerId === t.customerId)!
            return (
              <div className="tip" key={t.customerId}>
                <div className="small"><b>What happened ({e.who}):</b> the customer asked "{e.line}". The AI replied: {e.reply.split(/\r?\n/).join(' / ').slice(0, 200)}. The café did: {e.system} {e.note} (what the game observed)</div>
                <p><b>Experiment to try:</b> {t.change}</p>
                <p className="mono">Suggested wording (an idea, not tested): {t.suggestedLine}</p>
                <p className="small"><b>What to watch when you re-run:</b> {t.watch}</p>
                <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(t.suggestedLine)}>Copy this line</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
