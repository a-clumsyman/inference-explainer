import { useState } from 'react'

/** Biscuit the cat: a local, scripted walkthrough. No AI, no network, never edits the player's text. */
export type Spot = 'write' | 'shift' | 'results' | 'over'
const STEPS: Record<Spot, string[]> = {
  write: ['Write what the AI should do. Tap + Action to add the kitchen line.', 'Say what to do when you cannot help: not on the menu, sold out, no table.', 'Happy? Open the café.'],
  shift: ['Watch the tickets. Red means the kitchen said no.', 'You can skip the animation.'],
  results: ['Find a ✗ below. Tap it to see what the kitchen got.', 'Change one thing, then replay the same customers.', 'Tips are suggestions. You paste them yourself.'],
  over: ['The shift closed early. Tap Retry: same customers.', 'Look at the first ✗. What did the kitchen get?', 'Add or fix one line, then go again.'],
}
export function Biscuit({ spot }: { spot: Spot }) {
  const [n, setN] = useState(0)
  const [open, setOpen] = useState(true)
  const steps = STEPS[spot]
  const text = steps[n % steps.length]
  return (
    <div className="biscuit" data-spot={spot}>
      <span className="cat" aria-hidden="true">🐈</span>
      {open ? <span className="say" role="status">{text}</span> : <span className="say dim">Biscuit</span>}
      <button type="button" className="mini" onClick={() => { if (!open) setOpen(true); else setN(n + 1) }} aria-label="Next tip">{open ? 'Next' : 'Help'}</button>
      {open && <button type="button" className="mini" onClick={() => setOpen(false)} aria-label="Hide tip">Hide</button>}
    </div>
  )
}
