import { useState } from 'react'
import { BISCUIT } from './cafe/sprites.ts'
import { reducedMotion } from './cafe/Scene.tsx'

/** Biscuit the cat: a local, scripted walkthrough. No AI, no network, never edits the player's text. */
export type Spot = 'write' | 'shift' | 'review' | 'result' | 'over'
const STEPS: Record<Spot | 'resultClean', string[]> = {
  write: ['Write what the AI should do, in your own words.', 'A clear no is enough when something cannot be done. You can also offer a supported choice, without placing it until the customer agrees.', 'The cafe turns answers into orders itself - that part is never your job.', 'Happy? Open the cafe.'],
  shift: ['One card per customer. Tap a card for the play-by-play.', 'Green SERVED or BOOKED is good. Anything red needs a look in the review.'],
  review: ['One moment at a time. I say what happened, in plain words.', 'A suggestion is an experiment, not a proven fix. Tap Apply only if you like it.', 'Your words change only when you say so.'],
  result: ['Open the review to walk the rough moments with me.', 'Change one thing, then replay - that is the game.'],
  resultClean: ['All green - the brief worked this time.', 'Replay the same customers to check it was not luck.'],
  over: ['The shift closed early. Tap Retry: same customers.', 'Open the review and look at the first red moment.', 'Add or fix one line, then go again.'],
}
export function Biscuit({ spot, hasBad = true }: { spot: Spot; hasBad?: boolean }) {
  const [n, setN] = useState(0)
  const [open, setOpen] = useState(true)
  const still = reducedMotion()
  const steps = STEPS[spot === 'result' && !hasBad ? 'resultClean' : spot]
  const text = steps[n % steps.length]
  return (
    <div className="biscuit" data-spot={spot}>
      <span className="catwrap" aria-hidden="true">
        <img className={'catpix' + (still ? ' still' : '')} src={BISCUIT[0]} alt="" />
        <img className={'catpix blink' + (still ? ' still' : '')} src={BISCUIT[1]} alt="" />
      </span>
      {open ? <span className="say" role="status">{text}</span> : <span className="say dim">Biscuit</span>}
      <button type="button" className="mini" onClick={() => { if (!open) setOpen(true); else setN(n + 1) }} aria-label="Next tip">{open ? 'Next' : 'Help'}</button>
      {open && <button type="button" className="mini" onClick={() => setOpen(false)} aria-label="Hide tip">Hide</button>}
    </div>
  )
}
