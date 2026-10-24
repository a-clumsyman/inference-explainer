/** Corner Café sound: procedural chiptune music + sound cues made with Web Audio oscillators.
 *  No audio files, no downloads, no licenses. Everything is wrapped in try/catch so audio can
 *  never break the game. The AudioContext only starts inside a real tap (browser autoplay rule). */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let analyser: AnalyserNode | null = null
let meterBuf: Uint8Array<ArrayBuffer> | null = null
let musicTimer: number | null = null
let nextNoteAt = 0
let step = 0

const MUTE_KEY = 'cafe-muted'

export function muted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}

export function setMuted(m: boolean) {
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* private mode */ }
  if (master) master.gain.value = m ? 0 : 1
}

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted() ? 0 : 1
      master.connect(ctx.destination)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      master.connect(analyser)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

/** One enveloped oscillator note. */
function tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
  const c = ensure(); if (!c || !master) return
  try {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(vol, at + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g); g.connect(master)
    o.start(at); o.stop(at + dur + 0.05)
  } catch { /* audio is decorative */ }
}

const now = () => (ctx ? ctx.currentTime : 0)
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

/** UI tap. */
export function click() { tone(660, now(), 0.07, 'square', 0.05) }
/** Door bell: a customer steps up to the counter. */
export function ding() { const t = now(); tone(880, t, 0.25, 'triangle', 0.12); tone(1318.5, t + 0.02, 0.3, 'triangle', 0.06) }
/** Till: an order reached the kitchen. */
export function chaChing() { const t = now(); tone(987.8, t, 0.09, 'square', 0.1); tone(1318.5, t + 0.08, 0.3, 'square', 0.1) }
/** Booking desk: a table is reserved. */
export function bookChime() { const t = now(); [523.3, 659.3, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.22, 'triangle', 0.1)) }
/** Something went wrong for this customer. */
export function buzz() { const t = now(); tone(185, t, 0.28, 'sawtooth', 0.09); tone(174.6, t + 0.02, 0.28, 'sawtooth', 0.07) }
/** Shift survived. */
export function fanfare() { const t = now(); [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, t + i * 0.11, 0.32, 'square', 0.1)) }
/** Shift ended early. */
export function sad() { const t = now(); [392, 370, 349, 330].forEach((f, i) => tone(f, t + i * 0.16, 0.3, 'triangle', 0.09)) }
/** Biscuit has an idea. */
export function meow() {
  const c = ensure(); if (!c || !master) return
  try {
    const t = c.currentTime
    const o = c.createOscillator(); const g = c.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(620, t)
    o.frequency.exponentialRampToValueAtTime(930, t + 0.12)
    o.frequency.exponentialRampToValueAtTime(500, t + 0.34)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + 0.45)
  } catch { /* decorative */ }
}

/** A slow, cozy café loop. Midi notes, 0 = rest. */
const MELODY = [
  72, 0, 76, 79, 0, 76, 74, 0,
  72, 0, 76, 81, 0, 76, 74, 0,
  69, 0, 72, 76, 0, 72, 71, 0,
  67, 0, 71, 74, 72, 0, 0, 0,
]
const BASS = [48, 48, 45, 43] // C2 C2 A1 G1, one per bar
const STEP_S = 0.23

function pumpMusic() {
  const c = ensure(); if (!c) return
  try {
    while (nextNoteAt < c.currentTime + 0.6) {
      const i = step % MELODY.length
      const m = MELODY[i]
      if (m) tone(mtof(m), nextNoteAt, 0.21, 'triangle', 0.045)
      if (i % 8 === 0) tone(mtof(BASS[(step / 8 | 0) % BASS.length]), nextNoteAt, 0.6, 'sine', 0.06)
      step++; nextNoteAt += STEP_S
    }
  } catch { /* keep the game running */ }
}

/** Start the background loop. Idempotent; must be called from a user gesture at least once. */
export function startMusic() {
  const c = ensure(); if (!c || musicTimer != null) return
  nextNoteAt = c.currentTime + 0.1; step = 0
  musicTimer = window.setInterval(pumpMusic, 180)
}

/** Verification hook: peak level (0..1) on the same master gain that feeds the speakers.
 *  Nonzero while music or a cue plays means real samples are flowing to the output. */
export function meter(): number {
  if (!analyser) return 0
  if (!meterBuf) meterBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize))
  analyser.getByteTimeDomainData(meterBuf)
  let peak = 0
  for (let i = 0; i < meterBuf.length; i++) { const d = Math.abs(meterBuf[i] - 128); if (d > peak) peak = d }
  return peak / 128
}

export function stopMusic() {
  if (musicTimer != null) { clearInterval(musicTimer); musicTimer = null }
}

// Automated-check hook: live output level + context state, readable from the page console.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __cafeMeter?: () => number }).__cafeMeter = meter
  ;(window as unknown as { __cafeAudioState?: () => string }).__cafeAudioState = () => (ctx ? ctx.state : 'off') + (muted() ? ' muted' : '')
}
