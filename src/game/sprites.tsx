import { useMemo } from 'react'

// Hand-placed pixel grids. One char = one pixel; '.' is transparent.
const PAL: Record<string, string> = {
  k: '#0d0c18', w: '#f3e9d2', y: '#e8c170', Y: '#b98a3a', s: '#f0c8a0', S: '#c9946a',
  p: '#5f47a8', P: '#8f78d6', g: '#7fc4a0', G: '#4f8f72', c: '#8fd0e8', C: '#4a90b0',
  r: '#e58a6e', R: '#a8503a', o: '#8a6a4a', O: '#5b3a29', e: '#9a93c9', d: '#3b3550',
  m: '#c9c3a8', n: '#7a7468',
}

export const GRIDS: Record<string, string[]> = {
  wizard: [
    '.....kk.....',
    '....kppk....',
    '....kpPk....',
    '...kpppPk...',
    '..kppppppk..',
    '.kkkkkkkkkk.',
    '..kssssssk..',
    '..ksksskSk..',
    '..kssssssk..',
    '..kwwwwwwk..',
    '.kpkwwwwkpk.',
    '.kppkwwkppk.',
    'kPppppppppPk',
    'kpppyppyppPk',
    '.kppppppppk.',
    '..kkkkkkkk..',
  ],
  slime: [
    '............',
    '....kkkk....',
    '...kggggk...',
    '..kgggggGk..',
    '.kggwkggwkg.',
    '.kggkkggkkg.',
    '.kgggggggGk.',
    '.kggkkkkggk.',
    '.kgggggggGk.',
    '..kkkkkkkk..',
  ],
  ghost: [
    '....kkkk....',
    '...kccccck..',
    '..kcccccccck',
    '..kcwkccwkck',
    '..kckkcckkck',
    '..kccccccCck',
    '..kcckkkcCck',
    '..kcccccccck',
    '..kckcckcckk',
    '...k.kk.k...',
  ],
  golem: [
    '..kkkkkkkk..',
    '.kmmmmmmmmk.',
    '.kmkrmmkrmk.',
    '.kmmmmmmmnk.',
    '.kmmkkkkmnk.',
    'kkmmmmmmmnkk',
    'kmkmmmmmnkmk',
    'kmkmmmmmnkmk',
    '.kkkmmmmkkk.',
    '...kkkkkk...',
  ],
  torch: [
    '..r..',
    '.ryr.',
    '.ryr.',
    '..y..',
    '.kok.',
    '.kok.',
    '.kok.',
    '..k..',
  ],
  heart: [
    '.kk.kk.',
    'krrkrrk',
    'krrrrrk',
    '.krrrk.',
    '..krk..',
    '...k...',
  ],
  star: [
    '...k...',
    '..kyk..',
    'kkkyYkk',
    'kyyyyyk',
    '.kyyYk.',
    '.kykyk.',
    '.k...k.',
  ],
  starOff: [
    '...k...',
    '..kdk..',
    'kkkdkkk',
    'kddddk.',
    '.kdddk.',
    '.kdkdk.',
    '.k...k.',
  ],
  lock: [
    '..kkkk..',
    '.kn..nk.',
    '.k....k.',
    'kkkkkkkk',
    'kyyyyyYk',
    'kyykkyYk',
    'kyyyyyYk',
    'kkkkkkkk',
  ],
  skull: [
    '.kkkkkk.',
    'kwwwwwwk',
    'kwkwwkwk',
    'kwkwwkwk',
    'kwwkkwwk',
    '.kwwwwk.',
    '.kwkwkk.',
    '..kkkk..',
  ],
}

export function Sprite({
  name, scale = 6, flip, className, swap,
}: { name: string; scale?: number; flip?: boolean; className?: string; swap?: Record<string, string> }) {
  const g = GRIDS[name]
  const w = Math.max(...g.map((r) => r.length))
  const rects = useMemo(() => {
    const out: { x: number; y: number; c: string }[] = []
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]
        if (ch === '.') continue
        out.push({ x, y, c: swap?.[ch] ?? PAL[ch] ?? '#f0f' })
      }
    })
    return out
  }, [g, swap])
  return (
    <svg
      className={className}
      width={w * scale}
      height={g.length * scale}
      viewBox={`0 0 ${w} ${g.length}`}
      shapeRendering="crispEdges"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1} height={1} fill={r.c} />
      ))}
    </svg>
  )
}

/** Which familiar sprite represents a model family. */
export function familiarFor(family: string): string {
  if (family === 'Qwen3') return 'slime'
  if (family === 'SmolLM2') return 'ghost'
  return 'golem'
}

/** Colour swap so each model gets its own palette on the shared creature shape. */
export function tintFor(modelId: string): Record<string, string> | undefined {
  if (modelId === 'qwen3-1.7b') return { g: '#e8c170', G: '#b98a3a' }
  if (modelId === 'qwen3-4b') return { g: '#c9a0e8', G: '#8f6fb8' }
  return undefined
}
