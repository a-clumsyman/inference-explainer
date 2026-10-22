import { useState } from 'react'
import { useStore } from '../store'

export function Composer() {
  const { send, generating, stop, engineState, mockForced, webgpu } = useStore()
  const [text, setText] = useState('')
  const ready = mockForced || !webgpu ? true : engineState === 'ready'
  const submit = () => {
    if (!text.trim() || generating) return
    send(text)
    setText('')
  }
  return (
    <div style={{ borderTop: '1px solid var(--line-strong)', background: 'var(--paper-2)' }}>
      <div className="mx-auto flex items-end gap-2 px-5 py-3" style={{ maxWidth: 720 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          placeholder={generating ? 'generating...' : 'ask the machine something'}
          className="hairline-strong flex-1 resize-none px-3 py-2 outline-none"
          style={{ background: 'var(--paper)', borderRadius: 2, fontSize: 15.5, fontFamily: 'var(--serif)' }}
        />
        {generating ? (
          <button className="btn btn-accent" onClick={stop}>
            stop
          </button>
        ) : (
          <button className="btn" onClick={submit} disabled={!text.trim() || !ready} title={ready ? '' : 'model is loading'}>
            run
          </button>
        )}
      </div>
      {!ready && !generating && (
        <div className="label mx-auto px-5 pb-2" style={{ maxWidth: 720, fontSize: 9 }}>
          model loading - first run downloads weights, later runs read from cache
        </div>
      )}
    </div>
  )
}
