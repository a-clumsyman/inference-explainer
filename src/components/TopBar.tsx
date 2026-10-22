import { useStore } from '../store'

export function TopBar() {
  const { model, engineState, generating, entries } = useStore()
  const lastAssistant = [...entries].reverse().find((e) => e.role === 'assistant')
  const ctxUsed =
    lastAssistant && lastAssistant.role === 'assistant'
      ? (lastAssistant.stats?.promptTokens ?? 0) + (lastAssistant.stats?.completionTokens ?? 0)
      : 0
  return (
    <header
      className="mono flex items-center gap-4 px-5"
      style={{ height: 40, borderBottom: '1px solid var(--line-strong)', background: 'var(--paper)', fontSize: 11 }}
    >
      <span style={{ fontWeight: 600 }}>{model.label}</span>
      <span style={{ color: 'var(--ink-3)' }}>{model.quant}</span>
      <span className="ml-auto flex items-center gap-2" style={{ color: 'var(--ink-2)' }}>
        <span
          className="inline-block"
          style={{
            width: 7,
            height: 7,
            background: generating ? 'var(--accent)' : engineState === 'ready' ? 'var(--ok)' : 'var(--ink-3)',
          }}
        />
        {generating ? 'generating' : engineState}
      </span>
      <span style={{ color: 'var(--ink-3)' }}>
        ctx {ctxUsed}/{model.contextTokens}
      </span>
    </header>
  )
}
