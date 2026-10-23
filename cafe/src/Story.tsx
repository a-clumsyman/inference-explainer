import { useState } from 'react'
import { AvatarBox, lookFor, reducedMotion } from './cafe/Scene.tsx'
import { mug } from './cafe/props.ts'

/** The maker's own look: glasses and a hoodie. Clearly stylized pixel art, not a likeness. */
const MAKER = { ...lookFor({ id: 'clumsyman-maker' }), hair: '#2b2230', shirt: '#4a6fa5', acc: 'glass' as const }

/** The opening the maker asked for: he welcomes players himself and explains why the café exists. */
const BEATS = [
  'Hey, welcome to the Corner Café! I am Clumsyman - I build AI for a living.',
  'A lot of people think AI is all-powerful. Building with it every day taught me: it really is not.',
  'An AI can miss details. It can make things up with a straight face. It never truly knows your café.',
  'Clear instructions help a lot. But even a good brief needs checking, every single time.',
  'So I built this place. You write the rules, my AI works the counter, and you watch what it actually does.',
  'That is the whole idea: learn to guide AI by seeing where it slips. Your shift starts now.',
]

export function Story({ startLabel, onStart }: { startLabel: string; onStart: () => void }) {
  const [n, setN] = useState(0)
  const last = n === BEATS.length - 1
  const still = reducedMotion()
  return (
    <section className="card story">
      <div className="storystage" aria-hidden>
        <svg viewBox="0 0 150 72" shapeRendering="crispEdges" className="storybg">
          <rect width="150" height="46" fill="#e3c08c" /><rect y="30" width="150" height="2" fill="#c9955a" /><rect y="32" width="150" height="14" fill="#c98f5a" />
          <rect y="46" width="150" height="26" fill="#6b4328" />
          {[50, 62, 74, 86, 98, 110, 122, 134].map((fx) => <rect key={fx} x={fx} y="46" width="1" height="26" fill="#5a3620" opacity="0.5" />)}
          <rect x="5" y="5" width="32" height="19" fill="#5a3a24" /><rect x="6" y="6" width="30" height="17" fill="#2f3d33" />
          {['LATTE 4.50', 'CAPP 4.00', 'CROIS 3.20'].map((t, i) => <text key={t} x="8" y={12 + i * 5} fontSize="3.6" fill="#f1e7d0" fontFamily="VT323">{t}</text>)}
          {[45, 100].map((lx) => <g key={lx}><rect x={lx} y="0" width="1" height="5" fill="#3a2a22" /><rect x={lx - 4} y="5" width="9" height="3" fill="#e8a33d" /><rect x={lx - 8} y="8" width="17" height="10" fill="#fff2c0" opacity="0.22" /></g>)}
          <rect x="112" y="5" width="34" height="22" fill="#7a4a2c" /><rect x="114" y="7" width="14" height="18" fill="#8fb4d9" /><rect x="130" y="7" width="14" height="18" fill="#8fb4d9" />
          <rect x="40" y="34" width="72" height="16" fill="#8a5a3a" /><rect x="40" y="32" width="72" height="3" fill="#b97e50" />
          <image href={mug} x="44" y="26" width="6" height="6" style={{ imageRendering: 'pixelated' }} />
          <image href={mug} x="100" y="26" width="6" height="6" style={{ imageRendering: 'pixelated' }} />
        </svg>
        <div className={still ? 'maker' : 'maker pop'}>
          <AvatarBox look={MAKER} mood="happy" px={7} label="Clumsyman, the maker of this game" />
          <span className="nametag">CLUMSYMAN · AI ENGINEER</span>
        </div>
      </div>
      <div className="speech" role="status">
        <p className="speechline">{BEATS[n]}</p>
        <div className="speechctl">
          <span className="dots" aria-label={`Message ${n + 1} of ${BEATS.length}`}>{BEATS.map((_, i) => <i key={i} className={i === n ? 'on' : ''} />)}</span>
          {last
            ? <button className="btn start" onClick={onStart}>{startLabel}</button>
            : <button className="btn ghost next" onClick={() => setN(n + 1)}>Next ▸</button>}
        </div>
      </div>
      {!last && <button className="skiplink" onClick={onStart}>Skip intro</button>}
      <p className="small credit">A game by Clumsyman. Café food art: Kenney (kenney.nl), CC0.</p>
    </section>
  )
}
