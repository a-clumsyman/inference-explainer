import { CATALOG, useStore } from '../store'
import { hasDeepEngine } from '../engine/transformersjs'
import type { ModelSpec } from '../engine/types'

function fmtMB(mb: number): string {
  if (!mb) return '-'
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function ModelCard({ m }: { m: ModelSpec }) {
  const { modelId, selectModel, engineState, loadProgress, generating, engineChoice, mockForced } = useStore()
  const active = m.id === modelId
  const loading = active && engineState === 'loading'
  const deepBlocked = engineChoice === 'deep' && !mockForced && !hasDeepEngine(m) && !m.comingSoon
  const disabled = m.comingSoon || generating || deepBlocked
  return (
    <button
      onClick={() => selectModel(m.id)}
      disabled={disabled}
      className={`w-full text-left border px-3 py-2.5 transition-colors ${
        active
          ? 'border-[var(--ink)] bg-[var(--paper)]'
          : 'border-[var(--line)] bg-transparent hover:border-[var(--line-strong)]'
      } ${m.comingSoon ? 'opacity-55 cursor-default' : 'cursor-pointer'}`}
      style={{ borderRadius: 2 }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
          {m.label}
        </span>
        <span className="label" style={{ fontSize: 9 }}>
          {m.family}
        </span>
      </div>
      <div className="mono mt-1.5 grid grid-cols-3 gap-x-2" style={{ fontSize: 10, color: 'var(--ink-2)' }}>
        <span>{Number.isNaN(m.paramsB) ? 'closed' : `${m.paramsB}B`}</span>
        <span>{m.quant}</span>
        <span>{fmtMB(m.weightsMB)}</span>
      </div>
      <p className="mt-1.5 italic" style={{ fontSize: 12.5, lineHeight: 1.35, color: 'var(--ink-2)' }}>
        {m.note}
      </p>
      {deepBlocked && (
        <div className="label mt-1.5" style={{ fontSize: 9 }}>
          fast engine only - no onnx build wired yet
        </div>
      )}
      {m.comingSoon && (
        <div className="label mt-1.5" style={{ color: 'var(--accent)', fontSize: 9 }}>
          showcase mode - limited internals
        </div>
      )}
      {loading && loadProgress && (
        <div className="mt-2">
          <div className="h-[3px] w-full" style={{ background: 'var(--paper-3)' }}>
            <div
              className="h-full transition-all"
              style={{ width: `${Math.round(loadProgress.fraction * 100)}%`, background: 'var(--accent)' }}
            />
          </div>
          <div className="label mt-1" style={{ fontSize: 9 }}>
            {loadProgress.stage} - {Math.round(loadProgress.fraction * 100)}%
          </div>
        </div>
      )}
    </button>
  )
}

function Slider({
  name,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  name: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  fmt: (v: number) => string
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-baseline justify-between">
        <span className="label">{name}</span>
        <span className="mono" style={{ fontSize: 12 }}>
          {fmt(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

export function Rail() {
  const s = useStore()
  return (
    <aside
      className="flex h-full flex-col overflow-y-auto scroll-thin"
      style={{ background: 'var(--paper-2)', borderRight: '1px solid var(--line-strong)', width: 296 }}
    >
      <div className="rack-section" style={{ borderBottom: '1px solid var(--line-strong)' }}>
        <div className="mono" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '.06em' }}>
          INFERENCE, OBSERVED
        </div>
        <p className="italic mt-1" style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.35 }}>
          a chat window bolted onto the side of the machine
        </p>
      </div>

      <div className="rack-section">
        <div className="label mb-2">01 / model</div>
        <div className="flex flex-col gap-2">
          {CATALOG.map((m) => (
            <ModelCard key={m.id} m={m} />
          ))}
        </div>
      </div>

      <div className="rack-section">
        <div className="label mb-1">02 / sampling</div>
        <Slider
          name="temperature"
          value={s.sampling.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => s.setSampling({ temperature: v })}
          fmt={(v) => v.toFixed(2)}
        />
        <Slider
          name="top_p"
          value={s.sampling.topP}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(v) => s.setSampling({ topP: v })}
          fmt={(v) => v.toFixed(2)}
        />
        <Slider
          name="max tokens"
          value={s.sampling.maxTokens}
          min={16}
          max={512}
          step={8}
          onChange={(v) => s.setSampling({ maxTokens: v })}
          fmt={(v) => `${v}`}
        />
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="label">top_k {s.engineChoice !== 'deep' && !s.mockForced ? '' : ''}</span>
            <span className="mono" style={{ fontSize: 12 }}>
              {s.sampling.topK === 0 ? 'off' : s.sampling.topK}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={s.sampling.topK}
            disabled={s.engineChoice !== 'deep' && !s.mockForced}
            onChange={(e) => s.setSampling({ topK: parseInt(e.target.value, 10) })}
          />
          {s.engineChoice !== 'deep' && !s.mockForced ? (
            <p className="mt-1" style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
              the fast engine does not accept top_k. switch to the deep engine (runtime panel) to
              apply it inside the sampling loop.
            </p>
          ) : (
            <p className="mt-1" style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
              {s.mockForced
                ? 'demo data ignores sampling settings.'
                : 'applied natively at each step: only the k best tokens can be sampled.'}
            </p>
          )}
        </div>
      </div>

      <div className="rack-section">
        <div className="label mb-2">03 / runtime</div>
        <div className="mono flex flex-col gap-1" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
          <div className="flex justify-between">
            <span>webgpu</span>
            <span style={{ color: s.webgpu ? 'var(--ok)' : 'var(--accent)' }}>
              {s.webgpu ? 'present' : 'absent'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>state</span>
            <span>{s.mockForced ? 'demo data (mock)' : s.engineState}</span>
          </div>
          {!s.mockForced && (
            <div className="mt-2 flex gap-1">
              {(['fast', 'deep'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => s.setEngineChoice(k)}
                  className="btn flex-1"
                  style={{
                    padding: '4px 0',
                    fontSize: 9,
                    background: s.engineChoice === k ? 'var(--ink)' : 'var(--paper)',
                    color: s.engineChoice === k ? 'var(--paper)' : 'var(--ink)',
                  }}
                >
                  {k === 'fast' ? 'fast - web-llm' : 'deep - t.js'}
                </button>
              ))}
            </div>
          )}
          {!s.mockForced && (
            <p className="mt-1" style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
              {s.engineChoice === 'fast'
                ? 'fast: precompiled WebGPU kernels, top-5 odds per step.'
                : 'deep: native top_k, full-vocab odds (top-32 shown), reply appears after the full pass then replays step by step.'}
            </p>
          )}
          <div className="flex justify-between">
            <span>weights cache</span>
            <span>indexeddb</span>
          </div>
        </div>
        {s.webgpu && (
          <label className="mono mt-2 flex items-center gap-2" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
            <input
              type="checkbox"
              checked={s.mockForced}
              onChange={(e) => s.setMockForced(e.target.checked)}
            />
            run on demo data instead
          </label>
        )}
        {s.engineState === 'error' && (
          <p className="mt-2" style={{ fontSize: 11.5, color: 'var(--accent)' }}>
            engine error: {s.loadError}
          </p>
        )}
      </div>

      <div className="mt-auto rack-section" style={{ borderTop: '1px solid var(--line-strong)' }}>
        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
          every reply below is annotated with the tokenization, timing and next-token odds that
          produced it. click any token to inspect. open models run fully in this tab.
        </p>
      </div>
    </aside>
  )
}
