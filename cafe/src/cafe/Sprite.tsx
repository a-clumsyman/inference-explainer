const BODY = [
  '..hhhh..',
  '.hhhhhh.',
  '.hsssss.',
  '.sessse.',
  '.ssssss.',
  '..tttt..',
  '.tttttt.',
  'ttttttt.',
  '.tt..tt.',
  '.bb..bb.',
]
const PAL: Record<string, Record<string, string>> = {
  ordinary: { h: '#5b3a29', s: '#f0c8a0', e: '#2a1a14', t: '#4f8a6b', b: '#2f2a3a' },
  pushy: { h: '#222', s: '#e8b88e', e: '#2a1a14', t: '#b5483a', b: '#2f2a3a' },
  unknown: { h: '#d9b45a', s: '#f4d2b0', e: '#2a1a14', t: '#4a6fa5', b: '#2f2a3a' },
  barista: { h: '#8a5a3a', s: '#f0c8a0', e: '#2a1a14', t: '#e8dcc0', b: '#3a2a22' },
}
export function Sprite({ kind, size = 6 }: { kind: string; size?: number }) {
  const pal = PAL[kind] ?? PAL.ordinary
  return (
    <svg width={8 * size} height={10 * size} viewBox="0 0 8 10" shapeRendering="crispEdges" aria-hidden>
      {BODY.flatMap((row, y) =>
        [...row].map((c, x) => (pal[c] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={pal[c]} /> : null)),
      )}
    </svg>
  )
}
