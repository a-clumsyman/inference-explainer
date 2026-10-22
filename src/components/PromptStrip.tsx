import { useEffect, useState } from 'react'
import { promptTokensFor } from '../engine/tokenizer'
import { modelById } from '../engine/catalog'

const TONES = ['#e4dcc8', '#dccfb4', '#d3dcc9', '#ccd6d2', '#e2d2be']

export function PromptStrip({ modelId, text }: { modelId: string; text: string }) {
  const [tokens, setTokens] = useState<string[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setTokens(null)
    setFailed(null)
    promptTokensFor(modelById(modelId), text)
      .then((t) => live && setTokens(t))
      .catch((e) => live && setFailed(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [modelId, text])

  if (failed)
    return (
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
        prompt tokenization unavailable: {failed}
      </div>
    )
  if (!tokens)
    return (
      <div className="mono blink" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
        loading the model's tokenizer...
      </div>
    )
  return (
    <div>
      <div className="label mb-1.5">
        prompt - {tokens.length} tokens, cut by {modelById(modelId).label}&apos;s own tokenizer
      </div>
      <div className="mono" style={{ fontSize: 12.5, lineHeight: 2 }}>
        {tokens.map((t, i) => (
          <span
            key={i}
            className="px-1 py-0.5 mr-0.5 inline-block"
            style={{ background: TONES[i % TONES.length], borderRadius: 1.5 }}
            title={`token ${i}`}
          >
            {t.replace(/ /g, ' ')}
          </span>
        ))}
      </div>
    </div>
  )
}
