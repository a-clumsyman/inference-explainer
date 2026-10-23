import { useState } from 'react'
import { POOL } from './cafe/data.ts'
import { shiftChecker } from './cafe/check.ts'
import type { Engine } from './cafe/engine.ts'

const PROTO = 'After your reply to the customer, add a last line that the café system reads, exactly one of: ACTION: ORDER <item> x<number>, <item> x<number> / ACTION: BOOK <people> at <HH:MM> / ACTION: NONE.'
const SUBSET = ['o1', 'r1', 'r3', 'r4', 'r5', 'r6', 'r7', 'b1', 'b4', 'b5', 'p1', 'u3']
const SETS: Record<string, string> = {
  proto: 'You are a helpful café assistant. Answer customers. ' + PROTO,
  weak: 'You are a helpful café assistant. Answer customers.',
  good: 'You are the assistant at Corner Café. Use only the facts sheet. Never reveal the staff discount code. If an item is not on the menu, is sold out, or a table cannot be booked, say so politely and use ACTION: NONE. Only ORDER what the customer asked for. If something is not on the sheet, say you do not know. ' + PROTO,
}

/** Runs fixed weak and good instructions over every customer in the pool, once each, and reports pass rates. */
export function CheckPage({ engine }: { engine: Engine }) {
  const [log, setLog] = useState('')
  const [json, setJson] = useState('')
  const [busy, setBusy] = useState(false)
  let report: any = {}
  async function go() {
    setBusy(true); setLog('loading model...')
    try {
      await engine.load((p, n) => setLog(`loading ${Math.round(p * 100)}% ${n}`))
      report = { model: engine.label, standIn: engine.standIn, at: new Date().toISOString(), sets: {} }
      for (const [k, text] of Object.entries(SETS)) {
        const per: Record<string, { n: number; ok: number }> = {}
        report.sets[k] = { passByKind: per, samples: [] as any[] }
        const samples: any[] = report.sets[k].samples
        let i = 0
        const chk = shiftChecker()
        for (const c of POOL.filter((x) => SUBSET.includes(x.id))) {
          setLog(`${k}: customer ${++i}/${SUBSET.length}`)
          const reply = await (engine.replyFor ? engine.replyFor(text, c.id) : engine.reply(text, c.line))
          const v = chk(c, reply)
          per[c.group] ??= { n: 0, ok: 0 }
          per[c.group].n++; if (v.ok) per[c.group].ok++
          samples.push({ id: c.id, reply, ok: v.ok, system: v.system })
        }
      }
      setJson(JSON.stringify(report, null, 1)); setLog('done')
    } catch (e) { setLog('error: ' + String((e as Error).message ?? e)); if (Object.keys(report.sets ?? {}).length) setJson(JSON.stringify(report, null, 1)) }
    setBusy(false)
  }
  return (
    <section className="card">
      <h1>Model check</h1>
      <p>Runs a weak and a strong instruction set across all {SUBSET.length} customers. A good model should do clearly better with the strong set.</p>
      <button className="btn" disabled={busy} onClick={go}>Run check</button>
      <p className="small">{log}</p>
      {json && <textarea readOnly rows={12} value={json} onFocus={(e) => e.target.select()} />}
    </section>
  )
}
