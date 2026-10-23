import { useState } from 'react'
import { MENU, MAX_WORDS } from './cafe/data.ts'
import { wordCount } from './cafe/check.ts'

type Kind = 'order' | 'book' | 'none'

/** "+ Action": pick an action and fill its details. Only the player's own click adds the line, and Undo puts the text back. */
export function ActionAdder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('order')
  const [item, setItem] = useState('latte')
  const [qty, setQty] = useState(1)
  const [people, setPeople] = useState(2)
  const [time, setTime] = useState('10:00')
  const [before, setBefore] = useState<string | null>(null)
  const line = kind === 'order'
    ? `ACTION: ORDER ${item} x${qty}`
    : kind === 'book' ? `ACTION: BOOK ${people} at ${time}` : 'ACTION: NONE'
  const sentence = kind === 'order'
    ? `For orders, end your reply with a last line: ACTION: ORDER <item> x<number>, like ${line}. Use the customer's real order.`
    : kind === 'book'
      ? `For tables, end your reply with a last line: ACTION: BOOK <people> at <HH:MM>, like ${line}. Use the customer's real details.`
      : `If you cannot help (not on the menu, sold out, no table), end your reply with ${line}.`
  const added = wordCount(sentence)
  const total = wordCount(value) + added
  const fits = total <= MAX_WORDS
  function add() {
    setBefore(value)
    onChange(value.trimEnd() + (value.trim() ? '\n' : '') + sentence)
  }
  return (
    <div className="adder">
      {!open && <button type="button" className="btn ghost addbtn" onClick={() => setOpen(true)} aria-expanded="false">+ Action</button>}
      {open && (
        <div className="adder-box" role="group" aria-label="Add an action line">
          <div className="sheet-h">+ ACTION</div>
          <div className="seg" role="radiogroup" aria-label="Action type">
            {([['order', 'Order'], ['book', 'Book a table'], ['none', 'Cannot help']] as [Kind, string][]).map(([k, label]) => (
              <button type="button" key={k} role="radio" aria-checked={kind === k} className={'segb' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
          {kind === 'order' && (
            <div className="fields">
              <label>Example item (yours: real order) <select value={item} onChange={(e) => setItem(e.target.value)}>{Object.keys(MENU).map((m) => <option key={m}>{m}</option>)}</select></label>
              <label>How many <input type="number" min={1} max={9} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(9, Number(e.target.value) || 1)))} /></label>
            </div>
          )}
          {kind === 'book' && (
            <div className="fields">
              <label>Example people <input type="number" min={1} max={12} value={people} onChange={(e) => setPeople(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} /></label>
              <label>Example time <select value={time} onChange={(e) => setTime(e.target.value)}>{['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map((t) => <option key={t}>{t}</option>)}</select></label>
            </div>
          )}
          <p className="mono">{sentence}</p>
          <p className={fits ? 'small' : 'small bad'}>+{added} words ({total}/{MAX_WORDS})</p>
          <div className="adder-row">
            <button type="button" className="btn" disabled={!fits} onClick={add}>Add</button>
            <button type="button" className="btn ghost" disabled={before === null} onClick={() => { if (before !== null) { onChange(before); setBefore(null) } }}>Undo</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
