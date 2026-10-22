import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { Entry } from './Entry'

function Intro() {
  return (
    <div className="hairline-strong mx-auto mt-10 max-w-[520px] px-5 py-5" style={{ background: 'var(--paper-2)', borderRadius: 2 }}>
      <div className="label mb-3">how to read this machine</div>
      <ol className="flex flex-col gap-3" style={{ fontSize: 15, lineHeight: 1.5 }}>
        <li>
          <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>1.</span> Ask it
          something. Each reply is drawn as its own tokens - the exact pieces the model produced,
          one per step.
        </li>
        <li>
          <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>2.</span> Color is
          confidence. Ink means sure. <span style={{ color: 'var(--accent)' }}>Vermilion</span>{' '}
          means the model was guessing.
        </li>
        <li>
          <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>3.</span> Click any
          token to see what else it considered, and re-roll to watch the dice land differently.
        </li>
      </ol>
      <p className="mt-4 italic" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        try: "what happens to my prompt, in plain words?"
      </p>
    </div>
  )
}

export function Chat() {
  const { entries } = useStore()
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' })
  }, [entries])
  let assistantNo = 0
  return (
    <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5">
      {entries.length === 0 && <Intro />}
      <div className="mx-auto" style={{ maxWidth: 720 }}>
        {entries.map((e) => {
          if (e.role === 'user') {
            return (
              <div key={e.id} className="mb-4 flex justify-end">
                <div
                  className="px-3 py-2"
                  style={{
                    maxWidth: '78%',
                    background: 'var(--ink)',
                    color: 'var(--paper)',
                    borderRadius: 2,
                    fontSize: 15.5,
                    lineHeight: 1.5,
                  }}
                >
                  {e.text}
                </div>
              </div>
            )
          }
          assistantNo += 1
          return <Entry key={e.id} entry={e} index={assistantNo} />
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}
