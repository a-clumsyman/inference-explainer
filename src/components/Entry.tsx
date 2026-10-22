import { useMemo, useState } from 'react'
import { useStore, type AssistantEntry, type TokenEvent } from '../store'
import { PromptStrip } from './PromptStrip'

function visibleTok(t: string): string {
  return t.replace(/\n/g, '\u23ce').replace(/ /g, ' ')
}

/** color a token by the model's confidence: ink = sure, accent = surprised */
function confColor(p: number): string {
  if (p >= 0.75) return 'var(--ink)'
  if (p >= 0.4) return 'var(--ink-2)'
  return 'var(--accent)'
}

function TimingBar({ entry }: { entry: AssistantEntry }) {
  const st = entry.stats
  if (!st) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-[8px] hatch" style={{ width: 60, opacity: 0.7 }} />
        <div className="h-[8px] flex-1" style={{ background: 'var(--paper-3)' }} />
      </div>
    )
  }
  const total = st.prefillMs + st.decodeMs || 1
  const prefillPct = Math.max(2, (st.prefillMs / total) * 100)
  return (
    <div>
      <div className="flex h-[8px] w-full">
        <div
          title={`prefill ${st.prefillMs.toFixed(0)} ms`}
          style={{ width: `${prefillPct}%`, background: 'var(--ink)' }}
        />
        <div className="hatch flex-1" title={`decode ${st.decodeMs.toFixed(0)} ms`} />
      </div>
      <div className="mono mt-1 flex justify-between" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>
        <span>
          prefill {st.prefillMs.toFixed(0)} ms
          {st.promptTokens != null ? ` (${st.promptTokens} prompt tok)` : ''}
        </span>
        <span>
          decode {st.decodeMs.toFixed(0)} ms - {st.tokensPerSec.toFixed(0)} tok/s
        </span>
      </div>
    </div>
  )
}

function Scope({ entry }: { entry: AssistantEntry }) {
  const { selected, setSelected } = useStore()
  const toks = entry.tokens
  const H = 44
  return (
    <div className="scope mt-2" style={{ height: H + 14 }}>
      <div className="grid-h" style={{ top: H * 0.25 }} />
      <div className="grid-h" style={{ top: H * 0.5 }} />
      <div className="grid-h" style={{ top: H * 0.75 }} />
      <div className="grid-h" style={{ top: H, background: 'var(--line-strong)' }} />
      <div className="absolute inset-x-0 top-0 flex items-end" style={{ height: H }}>
        {toks.map((t, i) => {
          const isSel = selected?.entryId === entry.id && selected.index === i
          const diverged = entry.prevTokens && entry.prevTokens[i] !== undefined && entry.prevTokens[i] !== t.text
          return (
            <div
              key={i}
              onClick={() => setSelected(isSel ? null : { entryId: entry.id, index: i })}
              className="flex-1 cursor-pointer"
              style={{
                height: `${Math.max(6, t.prob * 100)}%`,
                minWidth: 3,
                marginRight: 1,
                background: diverged ? 'repeating-linear-gradient(45deg, var(--accent) 0 2px, transparent 2px 4px)' : confColor(t.prob),
                outline: isSel ? '1px solid var(--accent)' : 'none',
                outlineOffset: 1,
                opacity: t.prob >= 0.75 ? 0.85 : 1,
              }}
              title={`${JSON.stringify(visibleTok(t.text))} p=${(t.prob * 100).toFixed(1)}%`}
            />
          )
        })}
        {entry.streaming && (
          <div className="blink" style={{ width: 8, height: H * 0.6, background: 'var(--accent)' }} />
        )}
      </div>
      <div className="label absolute" style={{ top: H + 3, left: 0, fontSize: 9 }}>
        p(sampled token) per step
      </div>
    </div>
  )
}

function TopK({ tok }: { tok: TokenEvent }) {
  const max = tok.top[0]?.prob ?? 1
  return (
    <div className="mt-2">
      {tok.top.map((t, i) => {
        const sampled = t.text === tok.text && Math.abs(t.prob - tok.prob) < 1e-6
        return (
          <div key={i} className="flex items-center gap-2" style={{ height: 20 }}>
            <span
              className="mono text-right shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ width: 110, fontSize: 11.5, color: sampled ? 'var(--accent)' : 'var(--ink)' }}
            >
              {JSON.stringify(visibleTok(t.text))}
            </span>
            <div className="h-[7px]" style={{ width: `${(t.prob / max) * 100}%`, maxWidth: '60%', background: sampled ? 'var(--accent)' : 'var(--ink-2)', opacity: sampled ? 1 : 0.5 }} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>
              {(t.prob * 100).toFixed(1)}%{sampled ? ' *' : ''}
            </span>
          </div>
        )
      })}
      <div className="label mt-1" style={{ fontSize: 9 }}>
        * sampled this step
      </div>
    </div>
  )
}

export function Entry({ entry, index }: { entry: AssistantEntry; index: number }) {
  const { selected, setSelected, reroll, generating } = useStore()
  const [anatomyOpen, setAnatomyOpen] = useState(true)
  const selTok: TokenEvent | null = useMemo(() => {
    if (selected?.entryId !== entry.id) return null
    return entry.tokens[selected.index] ?? null
  }, [selected, entry])
  const divergences = useMemo(() => {
    if (!entry.prevTokens) return 0
    return entry.tokens.filter((t, i) => entry.prevTokens![i] !== undefined && entry.prevTokens![i] !== t.text).length
  }, [entry])

  return (
    <article className="hairline-strong mb-5" style={{ background: 'var(--paper)', borderRadius: 2, boxShadow: '2px 2px 0 #1d1a1510' }}>
      <header
        className="mono flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
        style={{ borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--ink-2)' }}
      >
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>ENTRY {String(index).padStart(2, '0')}</span>
        <span>{entry.modelLabel}</span>
        <span>
          T={entry.sampling.temperature.toFixed(2)} top_p={entry.sampling.topP.toFixed(2)}
        </span>
        {entry.engine === 'mock' && <span style={{ color: 'var(--accent)' }}>demo data</span>}
        {entry.engine === 'deep' && <span>deep engine</span>}
        {entry.sampling.topK > 0 && <span>top_k={entry.sampling.topK}</span>}
        <span className="ml-auto flex gap-2">
          {entry.tokens.length > 0 && !entry.streaming && (
            <button className="btn" style={{ padding: '2px 8px', fontSize: 9 }} disabled={generating} onClick={() => reroll(entry.id)}>
              re-roll
            </button>
          )}
          <button className="btn" style={{ padding: '2px 8px', fontSize: 9 }} onClick={() => setAnatomyOpen((v) => !v)}>
            {anatomyOpen ? 'hide anatomy' : 'anatomy'}
          </button>
        </span>
      </header>

      <div className="px-3 py-3" style={{ fontSize: 16.5, lineHeight: 1.75 }}>
        {entry.tokens.length === 0 && entry.streaming && (
          <span className="mono blink" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            prefill...
          </span>
        )}
        {entry.tokens.map((t, i) => {
          const isSel = selected?.entryId === entry.id && selected.index === i
          const diverged = entry.prevTokens && entry.prevTokens[i] !== undefined && entry.prevTokens[i] !== t.text
          return (
            <span
              key={i}
              onClick={() => setSelected(isSel ? null : { entryId: entry.id, index: i })}
              className={`tok ${isSel ? 'sel' : ''}`}
              style={{
                color: confColor(t.prob),
                borderBottomColor: diverged ? 'var(--accent)' : undefined,
                borderBottomStyle: diverged ? 'dotted' : undefined,
              }}
              title={`p=${(t.prob * 100).toFixed(1)}%`}
            >
              {t.text}
            </span>
          )
        })}
        {entry.error && (
          <p className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>
            generation failed: {entry.error}
          </p>
        )}
      </div>

      {anatomyOpen && (entry.tokens.length > 0 || entry.streaming) && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="mt-3 mb-1 pb-3" style={{ borderBottom: '1px dashed var(--line)' }}>
            <PromptStrip modelId={entry.modelId} text={entry.promptText} />
          </div>
          <div className="label mt-2 mb-1">timing</div>
          <TimingBar entry={entry} />
          <div className="label mt-3 mb-1">confidence trace</div>
          <Scope entry={entry} />
          {selTok && (
            <div className="mt-3 pt-2" style={{ borderTop: '1px dashed var(--line)' }}>
              <div className="label mb-1">
                step {selected!.index} - what else it considered
              </div>
              <TopK tok={selTok} />
            </div>
          )}
          {divergences > 0 && (
            <p className="mono mt-2" style={{ fontSize: 10, color: 'var(--accent)' }}>
              re-roll diverged at {divergences} of {entry.tokens.length} steps (dotted underline / hatched bars)
            </p>
          )}
          {entry.stats && (
            <div className="mono mt-3 flex flex-wrap gap-x-4" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
              <span>{entry.stats.completionTokens} tokens out</span>
              {entry.stats.promptTokens != null && <span>{entry.stats.promptTokens} tokens in</span>}
              <span>{entry.stats.tokensPerSec.toFixed(1)} tok/s</span>
              <span>{entry.engine === 'deep' ? 'logprobs: full vocab, top-32 shown' : 'logprobs: top-5 per step'}</span>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
