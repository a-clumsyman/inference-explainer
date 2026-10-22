import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './game.css'
import { Sprite, familiarFor, tintFor } from './sprites'
import { useStore, CATALOG } from '../store'
import type { AssistantEntry } from '../store'
import { promptTokensFor } from '../engine/tokenizer'
import { hasDeepEngine } from '../engine/transformersjs'
import { modelById } from '../engine/catalog'

const SPELLS = ['Why is the sky blue?', 'Write a haiku about rain', 'Explain gravity to a kid', 'Name three odd animals']
const RARE = 0.15

const QUESTS = [
  { id: 'cast', label: 'CAST A SPELL' },
  { id: 'rare', label: 'OPEN A RARE DOOR' },
  { id: 'temp', label: 'ONE COLD, ONE HOT CAST' },
  { id: 'gates', label: 'SEAL THE GATES (DEEP)' },
  { id: 'hero', label: 'CAST WITH 2 HEROES' },
  { id: 'rewind', label: 'REWIND A REPLY' },
]

function useQuests() {
  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dungeon-quests') || '[]')
    } catch {
      return []
    }
  })
  const [toast, setToast] = useState<string | null>(null)
  const complete = useCallback((id: string) => {
    setDone((d) => {
      if (d.includes(id)) return d
      const n = [...d, id]
      try {
        localStorage.setItem('dungeon-quests', JSON.stringify(n))
      } catch {
        /* ignore */
      }
      const q = QUESTS.find((x) => x.id === id)
      setToast(`QUEST CLEAR: ${q?.label}`)
      setTimeout(() => setToast(null), 2400)
      return n
    })
  }, [])
  return { done, complete, toast }
}

let actx: AudioContext | null = null
function beep(freq: number, ms = 70) {
  try {
    actx = actx ?? new AudioContext()
    const o = actx.createOscillator()
    const g = actx.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.value = 0.04
    o.connect(g).connect(actx.destination)
    o.start()
    o.stop(actx.currentTime + ms / 1000)
  } catch {
    /* ignore */
  }
}

function Runes({ modelId, text }: { modelId: string; text: string }) {
  const [tokens, setTokens] = useState<string[] | null>(null)
  const [fail, setFail] = useState(false)
  useEffect(() => {
    let live = true
    setTokens(null)
    setFail(false)
    promptTokensFor(modelById(modelId), text)
      .then((t) => live && setTokens(t))
      .catch(() => live && setFail(true))
    return () => {
      live = false
    }
  }, [modelId, text])
  const cols = ['#e8c170', '#7fc4a0', '#e58a6e', '#8fb0e8', '#c9a0e8']
  if (fail) return <span style={{ color: '#9a93c9' }}>runes unreadable (no tokenizer for this hero)</span>
  if (!tokens) return <span style={{ color: '#9a93c9' }}>carving runes...</span>
  return (
    <>
      {tokens.map((t, i) => (
        <span key={modelId + i} className="rune px" style={{ background: cols[i % 5], animationDelay: `${i * 40}ms` }}>
          {t.replace(/ /g, '·')}
        </span>
      ))}
      <span className="h" style={{ color: '#9a93c9', marginLeft: 8 }}>{tokens.length} RUNES</span>
    </>
  )
}

export function Game({ onInsides }: { onInsides: () => void }) {
  const s = useStore()
  const { entries, generating, sampling, model } = s
  const { done, complete, toast } = useQuests()
  const [cursor, setCursor] = useState(0)
  const [follow, setFollow] = useState(true)
  const [play, setPlay] = useState(false)
  const [peek, setPeek] = useState<number | null>(null)
  const [party, setParty] = useState(false)
  const [sound, setSound] = useState(false)
  const [input, setInput] = useState('')
  const [shake, setShake] = useState(false)
  const castModels = useRef(new Set<string>())
  const castTemps = useRef({ cold: false, hot: false })

  const latest = useMemo(
    () => [...entries].reverse().find((e): e is AssistantEntry => e.role === 'assistant'),
    [entries],
  )
  const tokens = latest?.tokens ?? []
  const tok = tokens[Math.min(cursor, tokens.length - 1)]
  const isDeep = s.engineChoice === 'deep' && !s.mockForced
  const gatesOk = isDeep || s.mockForced
  const nDoors = 6

  // follow the stream
  useEffect(() => {
    if (follow && tokens.length) setCursor(tokens.length - 1)
  }, [tokens.length, follow])
  useEffect(() => {
    if (generating) {
      setFollow(true)
      setPlay(false)
    }
  }, [generating])
  // replay
  useEffect(() => {
    if (!play) return
    const t = setInterval(() => {
      setCursor((c) => {
        if (c >= tokens.length - 1) {
          setPlay(false)
          return c
        }
        return c + 1
      })
    }, 450)
    return () => clearInterval(t)
  }, [play, tokens.length])

  // reset peek and react to each new step
  useEffect(() => {
    setPeek(null)
    if (tok) {
      if (tok.prob < RARE) {
        setShake(true)
        setTimeout(() => setShake(false), 420)
        if (sound) beep(180, 120)
        complete('rare')
      } else if (sound) beep(520 + (cursor % 5) * 40, 45)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, latest?.id])

  // quest evaluation when a cast finishes
  useEffect(() => {
    if (!latest || latest.streaming || !latest.tokens.length) return
    complete('cast')
    castModels.current.add(latest.modelId)
    if (castModels.current.size >= 2) complete('hero')
    if (latest.sampling.temperature <= 0.3) castTemps.current.cold = true
    if (latest.sampling.temperature >= 1.2) castTemps.current.hot = true
    if (castTemps.current.cold && castTemps.current.hot) complete('temp')
    if (latest.engine === 'deep' && latest.sampling.topK > 0) complete('gates')
    if (latest.prevTokens) complete('rewind')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, latest?.streaming])

  const cast = (text: string) => {
    if (!text.trim() || generating) return
    s.send(text)
    setInput('')
    if (sound) beep(660, 120)
  }

  // doors for current step
  const T = sampling.temperature
  const shownTemp = latest ? latest.sampling.temperature : T
  const doors = useMemo(() => {
    if (!tok) return []
    let list = tok.top.slice(0, nDoors)
    if (!list.some((d) => d.text === tok.text)) list = [{ text: tok.text, prob: tok.prob }, ...list.slice(0, nDoors - 1)]
    const reshaped = Math.abs(T - shownTemp) > 0.01
    let probs = list.map((d) => d.prob)
    if (reshaped) {
      const w = probs.map((p) => Math.pow(p, shownTemp / Math.max(T, 0.05)))
      const sum = w.reduce((a, b) => a + b, 0)
      probs = w.map((x) => x / sum)
    }
    return list.map((d, i) => ({ ...d, shown: probs[i], taken: d.text === tok.text, reshaped }))
  }, [tok, T, shownTemp])
  const topK = sampling.topK
  const reshaped = doors[0]?.reshaped

  const tileWindow = (() => {
    const a = Math.max(0, cursor - 9)
    return tokens.slice(a, a + 20).map((t, i) => ({ t, i: a + i }))
  })()

  const loading = s.engineState === 'loading'
  const firstSpell = !latest && !generating
  const nextQuest = QUESTS.find((q) => !done.includes(q.id))

  let line = ''
  if (!latest) line = 'WRITE A SPELL BELOW. PRESS CAST.'
  else if (peek !== null && doors[peek])
    line = doors[peek].taken
      ? `MODEL CHOSE THIS DOOR (${(doors[peek].prob * 100).toFixed(0)}%)`
      : `PEEK ONLY: THE MODEL WEIGHED THIS AT ${(doors[peek].prob * 100).toFixed(0)}% BUT TOOK ANOTHER. REWIND TO ROLL AGAIN.`
  else if (tok) line = `MODEL CHOSE "${tok.text.trim() || '·'}" AT ${(tok.prob * 100).toFixed(0)}%. TAP A DOOR TO PEEK.`

  const prefillDone = !!latest && (latest.tokens.length > 0 || !!latest.stats)
  const decodeFrac = latest ? Math.min(1, latest.tokens.length / Math.max(1, latest.sampling.maxTokens * 0.5)) : 0

  return (
    <div className="dg">
      <div className="hud z">
        <div className="px pn h" style={{ padding: '8px 12px' }}>THE DUNGEON OF NEXT TOKENS</div>
        <div className="px pn" style={{ padding: '4px 10px', display: 'flex', gap: 4, alignItems: 'center' }}>
          {QUESTS.map((q) => (
            <Sprite key={q.id} name={done.includes(q.id) ? 'star' : 'starOff'} scale={3} />
          ))}
        </div>
        <div className="grow" />
        {s.mockForced && <div className="px h" style={{ background: '#e58a6e', color: '#2b0e08', padding: '6px 10px' }}>DEMO DATA</div>}
        <button className="px btn alt h" onClick={() => setSound((v) => !v)}>SOUND {sound ? 'ON' : 'OFF'}</button>
        <button className="px btn h" onClick={() => setParty(true)} disabled={generating}>HERO: {model.label} ▾</button>
        <button className="px btn alt h" onClick={onInsides}>SEE INSIDES</button>
      </div>

      <div className={`z ${shake ? 'shake' : ''}`} style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="wall" />
        <div className="torch" style={{ left: '6%' }}><Sprite name="torch" scale={6} /></div>
        <div className="torch" style={{ right: '5%' }}><Sprite name="torch" scale={6} /></div>

        <div className="z" style={{ padding: '4px 22px 0', maxHeight: '38%', overflow: 'hidden' }}>
          <div className="h" style={{ color: '#9a93c9' }}>YOUR SPELL · RUNES CUT BY {model.label}</div>
          <div style={{ minHeight: 44 }}>
            {latest ? <Runes modelId={s.modelId} text={latest.promptText} /> : <span style={{ color: '#9a93c9' }}>empty scroll</span>}
          </div>
          <div className="h" style={{ color: '#9a93c9', marginTop: 4 }}>THE PATH WALKED · TAP A STEP</div>
          <div style={{ minHeight: 40 }}>
            {tileWindow.map(({ t, i }) => (
              <span
                key={i}
                className={`tile px ${i === cursor ? 'cur' : ''} ${latest?.prevTokens && latest.prevTokens[i] !== t.text ? 'chg' : ''}`}
                onClick={() => {
                  setFollow(false)
                  setCursor(i)
                }}
              >
                {t.text.replace(/\n/g, '↵') || '·'}
              </span>
            ))}
            {generating && <span className="tile px cur">▮</span>}
          </div>
        </div>

        {/* quest list */}
        <div className="z px pn" style={{ position: 'absolute', left: 16, top: 150, padding: '6px 10px', width: 235 }}>
          <div className="h" style={{ marginBottom: 4 }}>QUESTS</div>
          {QUESTS.map((q) => (
            <div key={q.id} className="q" style={{ fontSize: 18, padding: 0, color: done.includes(q.id) ? '#7fc4a0' : q.id === nextQuest?.id ? '#f3e9d2' : '#9a93c9' }}>
              <span>{done.includes(q.id) ? '■' : q.id === nextQuest?.id ? '▶' : '□'}</span>
              {q.label}
            </div>
          ))}
        </div>

        {/* cast to explore: stage */}
        <div className="z" style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 14, padding: '0 20px 66px 270px', minHeight: 0 }}>
          <div style={{ position: 'relative', flex: '0 0 auto', marginRight: 6 }}>
            <Sprite name="wizard" scale={7} />
          </div>
          <div className={generating ? 'walk' : ''} style={{ flex: '0 0 auto', marginRight: 24 }}>
            <Sprite name={familiarFor(model.family)} scale={7} swap={tintFor(model.id)} />
          </div>
          {tok && doors.map((d, i) => {
            const p = d.shown
            const h = 80 + Math.sqrt(p) * 190
            const w = 76 + Math.sqrt(p) * 90
            const shut = topK > 0 && i >= topK && gatesOk
            return (
              <div className="doorwrap" key={d.text + i} style={{ position: 'relative' }}>
                {d.taken && peek === null && !shut && (
                  <div className="badge h" style={{ background: '#e8c170', color: '#2b1d0e', top: -34 }}>
                    {tok.prob < RARE ? 'RARE PATH!' : 'MODEL TOOK'}
                  </div>
                )}
                <div
                  className={`door px ${d.taken ? 'taken' : ''} ${shut ? 'shut' : ''}`}
                  style={{ height: h, width: w, outline: peek === i ? '4px solid #e58a6e' : undefined }}
                  onClick={() => {
                    setPeek(i)
                    if (s && d.prob < RARE) complete('rare')
                    if (sound) beep(300, 60)
                  }}
                  title={`${d.text} ${(d.prob * 100).toFixed(1)}%`}
                >
                  <span style={{ fontSize: 26 }}>{(d.shown * 100).toFixed(d.shown < 0.1 ? 1 : 0)}%</span>
                  {reshaped && <div className="ghostline" style={{ height: `${(80 + Math.sqrt(d.prob) * 190) / h * 100}%`, maxHeight: '100%' }} />}
                </div>
                <div style={{ fontSize: 20, maxWidth: w + 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre', color: '#f3e9d2' }}>
                  {d.text.replace(/ /g, '·').replace(/\n/g, '↵') || '·'}
                </div>
              </div>
            )
          })}
          {!tok && !loading && (
            <div className="px pn" style={{ padding: 14, alignSelf: 'center', maxWidth: 380 }}>
              <div className="h">DOORS APPEAR HERE</div>
              <div>Every word the model writes is a fork. Door size = its real odds.</div>
            </div>
          )}
          {loading && (
            <div className="px pn" style={{ padding: 14, alignSelf: 'center', width: 340 }}>
              <div className="h">WAKING THE HERO...</div>
              <div className="bar" style={{ margin: '8px 0' }}><i style={{ width: `${Math.round((s.loadProgress?.fraction ?? 0.03) * 100)}%`, background: '#8fb0e8' }} /></div>
              <div style={{ fontSize: 18, color: '#9a93c9' }}>{s.loadProgress?.detail?.slice(0, 60) ?? 'first time only: weights download'}</div>
            </div>
          )}
        </div>

        <div className="z px pn" style={{ position: 'absolute', left: 16, right: 16, bottom: 14, padding: '6px 12px', fontSize: 21, minHeight: 36 }}>
          {s.loadError || latest?.error ? (
            <span>
              THE HERO WON&apos;T WAKE ({(s.loadError || latest?.error || '').slice(0, 70)}...){' '}
              {!s.mockForced && <button className="px btn h" style={{ padding: '2px 8px' }} onClick={() => s.setMockForced(true)}>PLAY WITH DEMO DATA</button>}
            </span>
          ) : line}
        </div>
        {toast && <div className="toast px h">★ {toast}</div>}
      </div>

      {/* controls */}
      <div className="z px pn" style={{ margin: '0 0 0 0', padding: '10px 16px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'stretch', background: '#232041', borderRadius: 0 }}>
        <div style={{ width: 250 }}>
          <div className="h">PREFILL READ ALL RUNES AT ONCE {latest?.stats ? `· ${Math.round(latest.stats.prefillMs)}ms` : ''}</div>
          <div className="bar"><i style={{ width: prefillDone ? '100%' : generating ? '55%' : '0%', background: '#7fc4a0' }} /></div>
          <div className="h" style={{ marginTop: 6 }}>DECODE ONE STEP AT A TIME {latest?.stats ? `· ${latest.stats.tokensPerSec.toFixed(1)}/s` : ''}</div>
          <div className="bar"><i style={{ width: `${decodeFrac * 100}%`, background: '#e58a6e' }} /></div>
        </div>

        <div style={{ width: 230 }}>
          <div className="h">TEMPERATURE · {T.toFixed(1)}</div>
          <input type="range" min={0.1} max={2} step={0.1} value={T} onChange={(e) => s.setSampling({ temperature: +e.target.value })} disabled={generating} />
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9a93c9', fontSize: 18 }}><span>cold</span><span>hot</span></div>
          <div style={{ fontSize: 16, color: '#9a93c9' }}>{reshaped ? 'DOORS = PREVIEW OF DIAL' : 'MOVE DIAL: DOORS RESHAPE'}</div>
        </div>

        <div style={{ width: 280 }}>
          <div className="h" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            TOP_K GATES {!gatesOk && <Sprite name="lock" scale={2} />}
          </div>
          <div style={{ marginTop: 4, opacity: gatesOk ? 1 : 0.5 }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={`pip px ${topK === n ? '' : 'off'}`} disabled={!gatesOk || generating} onClick={() => s.setSampling({ topK: n })}>{n}</button>
            ))}
            <button className={`pip px ${topK === 0 ? '' : 'off'}`} disabled={!gatesOk || generating} onClick={() => s.setSampling({ topK: 0 })}>∞</button>
          </div>
          <div style={{ fontSize: 16, color: '#9a93c9' }}>
            {gatesOk ? (s.mockForced ? 'DEMO: SIMULATED GATES' : 'REAL: ENGINE APPLIES TOP_K') : 'LOCKED: FAST ENGINE CAN\'T. USE DEEP CAST ▸'}
          </div>
          <button className="px btn alt h" style={{ padding: '3px 8px', marginTop: 2 }} disabled={generating || s.mockForced || !s.webgpu}
            onClick={() => s.setEngineChoice(isDeep ? 'fast' : 'deep')}>
            {isDeep ? 'DEEP CAST ✓' : 'USE DEEP CAST'}
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="scroll" value={input} placeholder="write your spell..." onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cast(input)} disabled={generating} />
            {generating ? (
              <button className="px btn red h" onClick={s.stop}>■ STOP</button>
            ) : (
              <button className="px btn h" onClick={() => cast(input || SPELLS[0])}>CAST ▶</button>
            )}
            {firstSpell && <div className="ghosthand" style={{ right: 20, top: -34 }}>▼</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {SPELLS.slice(0, 3).map((sp) => (
              <button key={sp} className="px btn alt" style={{ padding: '0 6px', fontSize: 17 }} disabled={generating} onClick={() => cast(sp)}>{sp}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="px btn alt h" disabled={!tokens.length} onClick={() => { setFollow(false); setPlay(false); setCursor((c) => Math.max(0, c - 1)) }}>◀</button>
            <button className="px btn alt h" disabled={!tokens.length || generating} onClick={() => { setFollow(false); setCursor(0); setPlay((p) => !p) }}>{play ? '■ PAUSE' : '▶ REPLAY'}</button>
            <button className="px btn alt h" disabled={!tokens.length} onClick={() => { setFollow(false); setPlay(false); setCursor((c) => Math.min(tokens.length - 1, c + 1)) }}>▶</button>
            <button className="px btn alt h" disabled={!latest || generating} onClick={() => latest && s.reroll(latest.id)}>⟲ REWIND</button>
          </div>
        </div>
      </div>

      {party && (
        <div className="modal" onClick={() => setParty(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1000 }}>
            <div className="h" style={{ fontSize: 16, marginBottom: 12, textAlign: 'center' }}>PICK YOUR HERO · EACH CUTS RUNES DIFFERENTLY</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {CATALOG.filter((m) => !m.comingSoon).map((m) => {
                const blocked = isDeep && !hasDeepEngine(m)
                return (
                  <div key={m.id} className={`card px ${m.id === s.modelId ? 'sel' : ''}`} style={{ opacity: blocked ? 0.45 : 1 }}
                    onClick={() => { if (!blocked) { s.selectModel(m.id); setParty(false) } }}>
                    <Sprite name={familiarFor(m.family)} scale={6} swap={tintFor(m.id)} />
                    <div className="h" style={{ marginTop: 6 }}>{m.label}</div>
                    <div style={{ fontSize: 18, color: '#9a93c9', textAlign: 'left', marginTop: 4 }}>
                      SIZE <span className="bar" style={{ display: 'inline-block', width: 80, height: 12, padding: 2, verticalAlign: 'middle' }}><i style={{ width: `${Math.min(100, (Math.log2(m.paramsB * 8) / 5) * 100)}%`, background: '#e8c170' }} /></span>
                      <br />DL {m.weightsMB}MB
                      <br />{blocked ? 'FAST CAST ONLY' : m.note}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
                  }
