import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { Customer } from './data.ts'
import type { Ev, Mood } from './sim.ts'
import { mug, donutPink, syrup } from './props.ts'
import { WAITER, CHEF_IMG, SOUSCHEF_IMG, customerSprite } from './sprites.ts'

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const HAIR = ['#3a2a22', '#a3321f', '#8a8a8a', '#e8a33d', '#222', '#d9b45a']
const SHIRT = ['#4a7fb0', '#6bbf7a', '#3a3a4a', '#b05aa0', '#d9604c', '#4a6fa5']
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

interface Look { hair: string; shirt: string; pants: string; hairStyle: 'flat' | 'toque' | 'spiky' | 'bun' | 'long'; acc: 'cap' | 'glass' | 'tie' | 'apron' | 'hat' | 'none'; accc: string }
export function lookFor(c: { id: string; group?: string }): Look {
  const h = hash(c.id)
  const acc = c.group === 'push' ? 'tie' : (['cap', 'glass', 'none', 'cap'] as const)[h % 4]
  return {
    hair: HAIR[h % HAIR.length],
    shirt: c.group === 'push' ? '#3a3a4a' : SHIRT[(h >> 3) % SHIRT.length],
    pants: PANTS[(h >> 5) % PANTS.length],
    hairStyle: HAIRSTYLES[(h >> 7) % HAIRSTYLES.length],
    acc, accc: '#d9604c',
  }
}
export const CHEF: Look = { hair: '#f4f0e6', shirt: '#f4f0e6', pants: '#3a3230', hairStyle: 'toque', acc: 'none', accc: '#f4f0e6' }
export const BARISTA: Look = { hair: '#3a2a22', shirt: '#8a5a3a', pants: '#2f2a3a', hairStyle: 'bun', acc: 'apron', accc: '' }

const PANTS = ['#2f2a3a', '#3a3230', '#28303a', '#4a3a2a']
const HAIRSTYLES = ['flat', 'spiky', 'bun', 'long', 'flat', 'spiky'] as const
const HAIR_ROWS: Record<Look['hairStyle'], [string, string, string]> = {
  flat: ['....HHHH....', '...HHHHHH...', '..HHHHHHHH..'],
  toque: ['...HHHHHH...', '..HHHHHHHH..', '.HHHHHHHHHH.'],
  spiky: ['..H.H..H.H..', '..HHHHHHHH..', '..HHHHHHHH..'],
  bun: ['.....HH.....', '...HHHHHH...', '..HHHHHHHH..'],
  long: ['....HHHH....', '..HHHHHHHH..', '..HHHHHHHH..'],
}
const EYES: Record<'left' | 'center' | 'right', string> = {
  left: '..kwskwsss..',
  center: '..skwsskws..',
  right: '..sskwsskw..',
}
const MOUTH: Record<Mood, [string, string]> = {
  happy: ['..sskRRRRkss', '..sssRRRRsss'],
  neutral: ['..sssskksss.', '..sssssssss.'],
  upset: ['..sssRRRRsss', '..ssksssskss'],
}
const OPEN: [string, string] = ['..sskkkkkkss', '..ssskkkksss']
const PAL: Record<string, string> = { s: '#f0c9a0', k: '#1d1a24', w: '#ffffff', R: '#d9604c' }

type Pose = 'idle' | 'serve' | 'work' | 'wave'

/** Pixel person, 12x18: head, torso, arms by pose, legs and shoes. Talk cycles and work/wave loops
 *  run as CSS steps so reduced-motion users get a static frame with the same information. */
export function Avatar({ look, mood = 'neutral', x, y, w = 12, label, pose = 'idle', talking = false, glance }: { look: Look; mood?: Mood; x?: number; y?: number; w?: number; label?: string; pose?: Pose; talking?: boolean; glance?: 'left' | 'right' }) {
  const [m1, m2] = MOUTH[mood]
  let rows = [
    ...HAIR_ROWS[look.hairStyle],
    '..HsssssssH.',
    EYES[glance ?? 'center'],
    '..ssssssssss',
    m1, m2,
    '...BBBBBBBB.',
    '..BBBBBBBBBB',
    '..BBBBBBBBBB',
    '..BBBBBBBBBB',
    '..BBBBBBBBBB',
    '..pppppppp..',
    '..ppp..ppp..',
    '..ppp..ppp..',
    '..kkk..kkk..',
    '..kkk..kkk..',
  ]
  if (look.hairStyle === 'long') rows = rows.map((r, i) => (i >= 4 && i <= 7 ? r.slice(0, 2) + 'H' + r.slice(3, 10) + 'H' + r.slice(11) : r))
  const rects: ReactElement[] = []
  const paint = (r: string, yy: number, key: string) => [...r].forEach((ch, xx) => {
    const f = ch === 'H' ? look.hair : ch === 'B' ? look.shirt : ch === 'p' ? look.pants : PAL[ch]
    if (f) rects.push(<rect key={`${key}${xx}-${yy}`} x={xx} y={yy} width="1" height="1" fill={f} />)
  })
  rows.forEach((r, yy) => paint(r, yy, ''))
  OPEN.forEach((r, yy) => {
    [...r].forEach((ch, xx) => { if (PAL[ch]) rects.push(<rect key={`mo${xx}-${yy}`} x={xx} y={yy + 6} width="1" height="1" fill={PAL[ch]} className="mo" />) })
  })
  // pose arms: hands are separate groups so CSS can alternate them (work chop, wave)
  if (pose === 'idle') rects.push(<rect key="ha1" x="2" y="12" width="1" height="1" fill={PAL.s} />, <rect key="ha2" x="9" y="12" width="1" height="1" fill={PAL.s} />)
  if (pose === 'work') {
    ;[['hands1', 11], ['hands2', 12]].forEach(([cls, yy]) => {
      rects.push(<rect key={cls + '1'} className={cls as string} x="2" y={yy as number} width="1" height="1" fill={PAL.s} />, <rect key={cls + '2'} className={cls as string} x="9" y={yy as number} width="1" height="1" fill={PAL.s} />)
    })
  }
  if (pose === 'wave') {
    rects.push(<rect key="wv1" x="10" y="6" width="1" height="2" fill={look.shirt} />)
    rects.push(<rect key="wv2" className="arm1" x="10" y="4" width="1" height="2" fill={PAL.s} />)
    rects.push(<rect key="wv3" className="arm2" x="11" y="5" width="1" height="2" fill={PAL.s} />)
  }
  if (pose === 'serve') {
    rects.push(<rect key="tray" x="1" y="9" width="10" height="1" fill="#e8dcc0" />)
    rects.push(<rect key="th1" x="1" y="8" width="1" height="1" fill={PAL.s} />, <rect key="th2" x="10" y="8" width="1" height="1" fill={PAL.s} />)
    rects.push(<rect key="st1" className="steam" x="4" y="6" width="1" height="1.5" fill="#fff" opacity="0.6" />, <rect key="st2" className="steam s2" x="7" y="6" width="1" height="1.5" fill="#fff" opacity="0.6" />)
  }
  if (look.acc === 'cap') rects.push(<rect key="cap1" x="2" y="0" width="8" height="2" fill={look.accc} />, <rect key="cap2" x="1" y="2" width="10" height="1" fill={look.accc} />)
  if (look.acc === 'glass') rects.push(<rect key="g1" x="3" y="4" width="3" height="1" fill="#1d1a24" />, <rect key="g2" x="6" y="4" width="3" height="1" fill="#1d1a24" />)
  if (look.acc === 'tie') rects.push(<rect key="tie" x="5" y="9" width="2" height="4" fill={look.accc} />)
  if (look.acc === 'apron') rects.push(<rect key="ap" x="3" y="10" width="6" height="3" fill="#efe3c3" />)
  const cls = `av${pose !== 'idle' ? ' pose-' + pose : ''}${talking ? ' talk' : ''}`
  return (
    <svg x={x} y={y} width={w} height={(w * 18) / 12} viewBox="0 0 12 18" shapeRendering="crispEdges" className={cls} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {rects}
    </svg>
  )
}

export function AvatarBox({ look, mood, px = 5, label, pose, talking, glance }: { look: Look; mood?: Mood; px?: number; label?: string; pose?: Pose; talking?: boolean; glance?: 'left' | 'right' }) {
  return <svg width={12 * px} height={18 * px} viewBox="0 0 12 18" shapeRendering="crispEdges"><Avatar look={look} mood={mood} x={0} y={0} w={12} label={label} pose={pose} talking={talking} glance={glance} /></svg>
}

/** Real CC0 sprite placed in the SVG scene. h is the scene height; width follows the art's own aspect. */
export function SpriteImg({ href, x, y, h, ratio = 16 / 33, label }: { href: string; x: number; y: number; h: number; ratio?: number; label?: string }) {
  return <image href={href} x={x} y={y} width={h * ratio} height={h} preserveAspectRatio="xMidYMax meet" style={{ imageRendering: 'pixelated' }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}

interface View {
  cur: string | null
  ticket: { text: string; phase: 'received' | 'prep' | 'done' | 'denied' | 'none' } | null
  status: { stamp: string; short: string; tone: 'ok' | 'no' | 'run' } | null
  ticks: number
  stock: Record<string, number>
  booked: number
  mood: Record<string, Mood>
  spoken: string
  curLine: string
  eventKey: number
  served: number
  live: Mood | null
  cross: boolean
  denials: number
  reworks: number
}

function view(events: Ev[], upto: number): View {
  const v: View = { cur: null, ticket: null, status: null, ticks: 0, stock: { croissant: 2, 'banana bread': 1 }, booked: 0, mood: {}, spoken: '', curLine: '', eventKey: -1, served: 0, live: null, cross: false, denials: 0, reworks: 0 }
  for (const e of events.slice(0, upto)) {
    v.eventKey = e.idx
    if (e.stock) v.stock = e.stock
    if (e.booked !== undefined) v.booked = e.booked
    if (e.kind === 'arrive') { v.cur = e.cid; v.ticket = null; v.status = null; v.live = null; v.cross = false; v.spoken = ''; v.curLine = e.text.replace(/^[^:]*: /, '').replace(/^"|"$/g, '') }
    else if (e.kind === 'answered') v.spoken = e.text.replace(/^AI says: /, '')
    else if (e.kind === 'ticket_received') { v.ticket = { text: e.stamp ?? 'ACCEPTED', phase: 'received' }; v.status = { stamp: e.stamp ?? 'ACCEPTED', short: e.short ?? '', tone: 'run' } }
    else if (e.kind === 'prep_started') { if (v.ticket) v.ticket.phase = 'prep'; v.ticks = e.ticks ?? 0 }
    else if (e.kind === 'prep_done') { if (v.ticket) v.ticket.phase = 'done'; v.live = 'happy'; if (v.status) v.status = { stamp: 'READY', short: v.status.short, tone: 'ok' } }
    else if (e.kind === 'ticket_denied') { v.ticket = { text: e.stamp ?? 'DENIED', phase: 'denied' }; v.status = { stamp: e.stamp ?? 'DENIED', short: e.short ?? '', tone: 'no' }; v.denials++; v.live = 'upset'; v.cross = true }
    else if (e.kind === 'booking_rejected') { v.ticket = { text: e.stamp ?? 'DENIED', phase: 'denied' }; v.status = { stamp: e.stamp ?? 'DENIED', short: e.short ?? '', tone: 'no' }; v.denials++; v.live = 'upset'; v.cross = true }
    else if (e.kind === 'nothing_sent') {
      const clean = e.tone === 'ok'
      v.ticket = { text: e.stamp ?? (clean ? 'NO ACTION NEEDED' : 'NOT SENT'), phase: clean ? 'none' : 'denied' }
      v.status = { stamp: e.stamp ?? (clean ? 'NO ACTION NEEDED' : 'NOT SENT'), short: e.short ?? '', tone: clean ? 'ok' : 'no' }
      if (!clean) v.live = 'upset'
    }
    else if (e.kind === 'no_action') {
      const clean = e.tone === 'ok'
      v.ticket = { text: e.stamp ?? 'NO ACTION NEEDED', phase: clean ? 'none' : 'denied' }
      v.status = { stamp: e.stamp ?? 'NO ACTION NEEDED', short: e.short ?? '', tone: clean ? 'ok' : 'no' }
      if (!clean) v.live = 'upset'
    }
    else if (e.kind === 'rework') { v.reworks++; v.live = 'upset'; v.cross = true }
    else if (e.kind === 'booking_confirmed') { v.ticket = { text: e.stamp ?? 'BOOKED', phase: 'done' }; v.status = { stamp: e.stamp ?? 'BOOKED', short: e.short ?? '', tone: 'ok' }; v.live = 'happy' }
    else if (e.kind === 'mood' && e.mood) { v.mood[e.cid] = e.mood; v.served++; v.live = null }
  }
  return v
}

/** The café, drawn only from the event log. Nothing here is decided by the model. */
export function Scene({ shift, events, idx, pending }: { shift: Customer[]; events: Ev[]; idx: number; pending?: Customer | null }) {
  const v = useMemo(() => view(events, idx), [events, idx])
  const curC = pending ?? shift.find((c) => c.id === v.cur) ?? null
  const done = new Set(Object.keys(v.mood))
  const queue = shift.filter((c) => c.id !== curC?.id && !done.has(c.id)).slice(0, 5)
  const curMood: Mood = curC ? v.mood[curC.id] ?? v.live ?? 'neutral' : 'neutral'
  const chef: 'calm' | 'cross' | 'angry' = !v.cross ? 'calm' : v.denials >= 2 || v.reworks >= 2 ? 'angry' : 'cross'
  const lastKind = pending ? 'arrive' : idx > 0 ? events[idx - 1]?.kind : null
  const ph = v.ticket?.phase
  const custSay = curC ? (pending ? pending.line : v.curLine || curC.line) : ''
  const aiSay = pending ? 'thinking…' : v.spoken || '…'
  return (
    <div className="scene2">
      <div className="stagewrap">
      <svg viewBox="0 0 150 72" role="img" aria-label="The café, drawn from the shift events" shapeRendering="crispEdges">
        <rect width="150" height="46" fill="#e3c08c" /><rect y="30" width="150" height="2" fill="#c9955a" /><rect y="32" width="150" height="14" fill="#c98f5a" />
        <rect y="46" width="150" height="26" fill="#6b4328" />
        {[52, 66, 80, 94, 108, 122, 136].map((fx) => <rect key={fx} x={fx} y="46" width="1" height="26" fill="#5a3620" opacity="0.45" />)}
        <rect x="52" y="55" width="46" height="12" fill="#a3483c" /><rect x="52" y="55" width="46" height="1.5" fill="#c96052" /><rect x="52" y="65.5" width="46" height="1.5" fill="#c96052" />
        <rect x="5" y="5" width="32" height="19" fill="#5a3a24" /><rect x="6" y="6" width="30" height="17" fill="#2f3d33" />
        {['LATTE 4.50', 'CAPP 4.00', 'CROIS 3.20'].map((t, i) => <text key={t} x="8" y={12 + i * 5} fontSize="3.6" fill="#f1e7d0" fontFamily="VT323">{t}</text>)}
        <rect x="112" y="5" width="34" height="22" fill="#7a4a2c" /><rect x="114" y="7" width="14" height="18" fill="#8fb4d9" /><rect x="130" y="7" width="14" height="18" fill="#8fb4d9" />
        <rect x="112" y="27.5" width="34" height="1.5" fill="#b97e50" />
        <image href={syrup} x="115" y="21.5" width="5.5" height="6" style={{ imageRendering: 'pixelated' }} />
        <image href={mug} x="123" y="21.5" width="5.5" height="6" style={{ imageRendering: 'pixelated' }} />
        <image href={mug} x="131" y="21.5" width="5.5" height="6" style={{ imageRendering: 'pixelated' }} />
        <rect x="40" y="8" width="9" height="11" fill="#5a3a24" /><rect x="41" y="9" width="7" height="9" fill="#f1e7d0" /><image href={donutPink} x="41.5" y="10" width="6" height="6" style={{ imageRendering: 'pixelated' }} />
        <rect x="120" y="0" width="1" height="3" fill="#3a2a22" /><rect x="117" y="3" width="7" height="3" fill="#a3483c" /><rect x="116" y="6" width="2" height="4" fill="#3d6b34" /><rect x="119" y="6" width="2" height="6" fill="#4f8a44" /><rect x="122" y="6" width="2" height="4" fill="#3d6b34" />
        {[45, 100].map((lx) => <g key={lx}><rect x={lx} y="0" width="1" height="5" fill="#3a2a22" /><rect x={lx - 4} y="5" width="9" height="3" fill="#e8a33d" /><rect className="glow" x={lx - 8} y="8" width="17" height="10" fill="#fff2c0" opacity="0.22" /></g>)}
        <SpriteImg href={lastKind === 'answered' || lastKind === 'ticket_received' ? WAITER.talk : WAITER.stand} x={71} y={17} h={24} label="Your AI, the waiter" />
        <g className={'chef ' + chef}><SpriteImg href={CHEF_IMG} x={93} y={9} h={19} label={chef === 'calm' ? 'The chef, calm' : 'The chef, angry'} /><SpriteImg href={SOUSCHEF_IMG} x={104} y={9} h={19} ratio={23 / 33} label="The sous-chef" />{chef !== 'calm' && <g key={chef + v.denials + v.reworks} className="chefsay"><rect x="104" y="6" width={chef === 'angry' ? 27 : 14} height="9" fill="#fff" stroke="#d9604c" strokeWidth="0.8" /><text x="106" y="12.3" fontSize="4.2" fill="#a3321f" fontFamily="VT323">{chef === 'angry' ? 'NOT AGAIN!' : 'NO.'}</text></g>}</g>
        <rect x="50" y="22.5" width="64" height="2" fill="#b97e50" /><rect x="50" y="24.5" width="64" height="8" fill="#7a4a2c" />
        <rect x="106" y="17" width="8" height="5.5" fill="#9a9aa8" /><rect x="107.5" y="15.5" width="5" height="2" fill="#c2c2cc" /><rect className="steam" x="109" y="12" width="2" height="3" fill="#fff" opacity="0.6" />
        <rect x="40" y="34" width="72" height="16" fill="#8a5a3a" /><rect x="40" y="32" width="72" height="3" fill="#b97e50" />
        <image href={mug} x="60" y="26" width="6" height="6" style={{ imageRendering: 'pixelated' }} />
        <image href={mug} x="97" y="26" width="6" height="6" style={{ imageRendering: 'pixelated' }} />
        <rect className="steam" x="51" y="18" width="2" height="3" fill="#fff" opacity="0.6" /><rect className="steam s2" x="55" y="18" width="2" height="3" fill="#fff" opacity="0.6" /><rect x="46" y="23" width="14" height="10" fill="#9a9aa8" /><rect x="48" y="25" width="4" height="3" fill="#d9604c" />
        <rect x="96" y="27" width="11" height="6" fill="#e8a33d" /><rect x="98" y="28" width="7" height="2" fill="#1d1a24" />
        {/* pass window and ticket */}
        <rect x="52" y="6" width="38" height="14" fill="#5a3a24" />
        <rect x="54" y="8" width="34" height="10" fill="#3a2a22" />
        {v.ticket && (
          <g key={`t${v.eventKey >= 0 ? v.ticket.text + ph : ''}`} className={'ticket ' + ph}>
            <rect x="56" y="9" width="30" height="8" fill={ph === 'denied' ? '#d9604c' : ph === 'done' ? '#6bbf7a' : ph === 'none' ? '#9db3c8' : '#e8dcc0'} />
            <text x="58" y="14.5" fontSize="3.6" fill="#1d1a24" fontFamily="VT323">{v.ticket.text.toUpperCase().slice(0, 18)}</text>
            {ph === 'prep' && <rect className="prep" x="56" y="16" width="30" height="1.5" fill="#e8a33d" style={{ animationDuration: `${Math.max(0.4, v.ticks * 0.25)}s` }} />}
          </g>
        )}
        <text x="54" y="4.5" fontSize="3.4" fill="#5a3a24" fontFamily="VT323">KITCHEN PASS</text>
        {/* customer at the counter */}
        {curC && <g key={`c${curC.id}-${curMood}`} className={'cust ' + curMood}><SpriteImg href={customerSprite(curC.id)} x={66} y={42} h={24} label={`${curC.who}, ${curMood}`} />{curMood !== 'neutral' && <text className="emote" x="82" y="46" fontSize="8" fill={curMood === 'upset' ? '#d9604c' : '#6bbf7a'} fontFamily="VT323">{curMood === 'upset' ? '!' : '♥'}</text>}</g>}
        {/* queue */}
        {queue.map((c, i) => <SpriteImg key={c.id} href={customerSprite(c.id)} x={8 + i * 11} y={50} h={15} />)}
        <text x="6" y="70" fontSize="3.4" fill="#f1e7d0" fontFamily="VT323">QUEUE {queue.length}   SEEN {v.served}/{shift.length}</text>
        {/* tables: bookings accepted so far */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={96 + i * 17} y="58" width="14" height="3" fill="#b97e50" /><rect x={102 + i * 17} y="61" width="2" height="5" fill="#8a5a3a" />
            {i < v.booked && <g className="seat"><rect x={98 + i * 17} y="54" width="3" height="4" fill="#efe3c3" /><rect x={105 + i * 17} y="54" width="3" height="4" fill="#efe3c3" /></g>}
          </g>
        ))}
        <text x="96" y="70" fontSize="3.4" fill="#f1e7d0" fontFamily="VT323">BOOKED TODAY {v.booked} OF 3 TABLES</text>
        {/* stock */}
        <rect x="114" y="30" width="30" height="12" fill="#4a3326" /><text x="116" y="35" fontSize="3.4" fill="#f1e7d0" fontFamily="VT323">CROISSANT {v.stock.croissant}</text><text x="116" y="40" fontSize="3.4" fill="#f1e7d0" fontFamily="VT323">BANANA BR. {v.stock['banana bread']}</text>
      </svg>
      {curC && <div className="saybubble custsay" key={'c' + custSay}><small>{curC.who}</small><span className="saytxt">{custSay}</span></div>}
      {curC && <div className="saybubble aisay" key={'a' + aiSay}><small>YOUR AI</small><span className="saytxt">{aiSay}</span></div>}
      </div>
      {v.status && <div className={'kstat ' + v.status.tone}><b>{v.status.stamp}</b>{v.status.short ? ' · ' + v.status.short : ''}</div>}
      <details className="feedwrap"><summary>Play-by-play log (optional)</summary>
      <ol className="feed" aria-live="polite">
        {events.slice(Math.max(0, idx - 4), idx).map((e) => <li key={e.idx} className={'ev ' + e.kind}>{e.text}</li>)}
      </ol>
      </details>
    </div>
  )
}

/** Steps through the event log one event at a time. Pass total as it grows during a live shift.
 *  With gates on, the playhead stops at each gate index (just after a customer leaves) until next() is pressed. */
/** Reading dwell per event kind: how long each beat stays on screen before the next one. */
export const DWELL: Record<Ev['kind'], number> = {
  arrive: 2600, answered: 3600,
  ticket_received: 1800, prep_started: 1500, prep_done: 1800, rework: 2400,
  ticket_denied: 3200, booking_confirmed: 2400, booking_rejected: 3200,
  nothing_sent: 3000, no_action: 2400, ticket_unreadable: 3000,
  mood: 3400,
}

/**
 * The shift playhead: one event at a time at reading pace, only when not paused.
 * It can never outrun the events that exist, and nothing else moves it - the scene,
 * the transcript and the customer meter all read this one index, so they stay in sync.
 */
export function usePlayer(events: Ev[], start = 0) {
  const [idx, setIdx] = useState(start)
  const [paused, setPaused] = useState(false)
  const delay = idx > 0 ? DWELL[events[idx - 1]?.kind ?? 'arrive'] : 150
  const total = events.length
  useEffect(() => {
    if (paused || idx >= events.length) return
    const id = setTimeout(() => setIdx((i) => Math.min(total, i + 1)), delay)
    return () => clearTimeout(id)
  }, [idx, total, paused, delay])
  return {
    idx,
    paused,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    next: () => setIdx((i) => Math.min(events.length, i + 1)),
    skip: () => setIdx(events.length),
    replay: () => { setIdx(0); setPaused(false) },
    setIdx,
  }
}
