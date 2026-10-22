import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  GenerateResult,
  LoadProgress,
  ModelBackend,
  ModelSpec,
  SamplingParams,
  TokenEvent,
  ChatTurn,
} from './engine/types'
import { CATALOG, DEFAULT_MODEL_ID, modelById } from './engine/catalog'
import { MockBackend } from './engine/mock'
import { WebLLMBackend, hasWebGPU } from './engine/webllm'
import { TransformersJSBackend } from './engine/transformersjs'

export interface AssistantEntry {
  id: string
  role: 'assistant'
  modelId: string
  /** the user prompt this reply answers - drives the prompt token strip */
  promptText: string
  modelLabel: string
  engine: 'webllm' | 'mock' | 'deep'
  sampling: SamplingParams
  tokens: TokenEvent[]
  text: string
  stats: GenerateResult['stats'] | null
  streaming: boolean
  /** tokens of the previous version, set after a re-roll, for divergence marks */
  prevTokens?: string[]
  error?: string
}
export interface UserEntry {
  id: string
  role: 'user'
  text: string
}
export type ChatEntry = UserEntry | AssistantEntry

type EngineState = 'idle' | 'loading' | 'ready' | 'error'

interface StoreState {
  modelId: string
  engineState: EngineState
  engineKind: 'webllm' | 'mock'
  engineChoice: 'fast' | 'deep'
  webgpu: boolean
  mockForced: boolean
  loadProgress: LoadProgress | null
  loadError: string | null
  sampling: SamplingParams
  entries: ChatEntry[]
  generating: boolean
  selected: { entryId: string; index: number } | null
}

interface Store extends StoreState {
  selectModel: (id: string) => void
  setSampling: (patch: Partial<SamplingParams>) => void
  send: (text: string) => void
  reroll: (entryId: string) => void
  stop: () => void
  setSelected: (sel: StoreState['selected']) => void
  setMockForced: (v: boolean) => void
  setEngineChoice: (v: 'fast' | 'deep') => void
  model: ModelSpec
}

const StoreCtx = createContext<Store | null>(null)

let seq = 0
const nextId = () => `e${++seq}`

export function StoreProvider({ children }: { children: ReactNode }) {
  const webgpu = useMemo(() => hasWebGPU(), [])
  const [state, setState] = useState<StoreState>({
    modelId: DEFAULT_MODEL_ID,
    engineState: 'idle',
    engineKind: webgpu ? 'webllm' : 'mock',
    engineChoice: 'fast',
    webgpu,
    mockForced: !webgpu,
    loadProgress: null,
    loadError: null,
    sampling: { temperature: 0.8, topP: 0.95, topK: 0, maxTokens: 220, seed: undefined },
    entries: [],
    generating: false,
    selected: null,
  })
  const backendRef = useRef<ModelBackend | null>(null)
  const loadingRef = useRef<string | null>(null)
  const epochRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const loadedModelRef = useRef<string | null>(null)

  const makeBackend = useCallback((): ModelBackend => {
    if (state.mockForced || !state.webgpu) return new MockBackend()
    return state.engineChoice === 'deep' ? new TransformersJSBackend() : new WebLLMBackend()
  }, [state.mockForced, state.webgpu, state.engineChoice])

  const ensureLoaded = useCallback(
    async (modelId: string) => {
      const model = modelById(modelId)
      if (backendRef.current && loadedModelRef.current === modelId) return
      if (loadingRef.current === modelId) return
      loadingRef.current = modelId
      const epoch = epochRef.current
      const backend = makeBackend()
      backendRef.current = backend
      loadedModelRef.current = null
      setState((s) => ({ ...s, engineState: 'loading', loadError: null }))
      try {
        await backend.load(model, (p) =>
          setState((s) => (epoch === epochRef.current ? { ...s, loadProgress: p } : s)),
        )
        if (epoch !== epochRef.current) {
          // a mock toggle happened mid-load; discard this backend quietly
          loadingRef.current = null
          void backend.unload().catch(() => undefined)
          return
        }
        loadedModelRef.current = modelId
        loadingRef.current = null
        setState((s) => ({ ...s, engineState: 'ready' }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        loadingRef.current = null
        setState((s) => ({ ...s, engineState: 'error', loadError: msg }))
        throw err
      }
    },
    [makeBackend],
  )

  const runGeneration = useCallback(
    async (history: ChatTurn[], entryId: string, model: ModelSpec, sampling: SamplingParams) => {
      await ensureLoaded(model.id)
      const backend = backendRef.current
      if (!backend) throw new Error('engine was switched mid-load - try again')
      abortRef.current = new AbortController()
      const result = await backend.generate({
        messages: history,
        sampling: { ...sampling, seed: sampling.seed ?? Math.floor(Math.random() * 1e9) },
        signal: abortRef.current.signal,
        onToken: (t) => {
          setState((s) => ({
            ...s,
            entries: s.entries.map((e) =>
              e.id === entryId && e.role === 'assistant'
                ? { ...e, tokens: [...e.tokens, t], text: e.text + t.text }
                : e,
            ),
          }))
        },
      })
      setState((s) => ({
        ...s,
        entries: s.entries.map((e) =>
          e.id === entryId && e.role === 'assistant' ? { ...e, stats: result.stats, streaming: false } : e,
        ),
      }))
    },
    [ensureLoaded],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || state.generating) return
      const model = modelById(state.modelId)
      const userEntry: UserEntry = { id: nextId(), role: 'user', text: trimmed }
      const aEntry: AssistantEntry = {
        id: nextId(),
        role: 'assistant',
        modelId: model.id,
        promptText: trimmed,
        modelLabel: model.label,
        engine: state.mockForced || !state.webgpu ? 'mock' : state.engineChoice === 'deep' ? 'deep' : 'webllm',
        sampling: { ...state.sampling },
        tokens: [],
        text: '',
        stats: null,
        streaming: true,
      }
      const history: ChatTurn[] = [
        ...state.entries.map((e): ChatTurn =>
          e.role === 'user' ? { role: 'user', content: e.text } : { role: 'assistant', content: e.text },
        ),
        { role: 'user', content: trimmed },
      ]
      setState((s) => ({
        ...s,
        entries: [...s.entries, userEntry, aEntry],
        generating: true,
        selected: null,
      }))
      runGeneration(history, aEntry.id, model, state.sampling)
        .catch((err) => {
          setState((s) => ({
            ...s,
            entries: s.entries.map((e) =>
              e.id === aEntry.id && e.role === 'assistant'
                ? { ...e, streaming: false, error: err instanceof Error ? err.message : String(err) }
                : e,
            ),
          }))
        })
        .finally(() => setState((s) => ({ ...s, generating: false })))
    },
    [state, runGeneration],
  )

  const reroll = useCallback(
    (entryId: string) => {
      if (state.generating) return
      const idx = state.entries.findIndex((e) => e.id === entryId)
      if (idx < 1) return
      const target = state.entries[idx]
      if (target.role !== 'assistant') return
      const model = modelById(target.modelId)
      const history: ChatTurn[] = state.entries.slice(0, idx).map((e): ChatTurn =>
        e.role === 'user' ? { role: 'user', content: e.text } : { role: 'assistant', content: e.text },
      )
      const prevTokens = target.tokens.map((t) => t.text)
      setState((s) => ({
        ...s,
        generating: true,
        selected: null,
        entries: s.entries.map((e) =>
          e.id === entryId && e.role === 'assistant'
            ? { ...e, tokens: [], text: '', stats: null, streaming: true, prevTokens, error: undefined }
            : e,
        ),
      }))
      const freshSampling = { ...target.sampling, seed: undefined }
      runGeneration(history, entryId, model, freshSampling)
        .catch((err) => {
          setState((s) => ({
            ...s,
            entries: s.entries.map((e) =>
              e.id === entryId && e.role === 'assistant'
                ? { ...e, streaming: false, error: err instanceof Error ? err.message : String(err) }
                : e,
            ),
          }))
        })
        .finally(() => setState((s) => ({ ...s, generating: false })))
    },
    [state, runGeneration],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setState((s) => ({
      ...s,
      generating: false,
      entries: s.entries.map((e) =>
        e.role === 'assistant' && e.streaming ? { ...e, streaming: false } : e,
      ),
    }))
  }, [])

  const selectModel = useCallback(
    (id: string) => {
      const model = modelById(id)
      if (model.comingSoon) return
      setState((s) => ({ ...s, modelId: id }))
      void ensureLoaded(id).catch(() => undefined)
    },
    [ensureLoaded],
  )

  const setSampling = useCallback(
    (patch: Partial<SamplingParams>) => setState((s) => ({ ...s, sampling: { ...s.sampling, ...patch } })),
    [],
  )
  const setSelected = useCallback((sel: StoreState['selected']) => setState((s) => ({ ...s, selected: sel })), [])
  const setEngineChoice = useCallback((v: 'fast' | 'deep') => {
    epochRef.current += 1
    loadedModelRef.current = null
    loadingRef.current = null
    backendRef.current?.unload().catch(() => undefined)
    backendRef.current = null
    setState((s) => ({ ...s, engineChoice: v, engineState: 'idle', loadProgress: null }))
  }, [])

  const autoLoadRef = useRef(false)
  useEffect(() => {
    if (autoLoadRef.current) return
    autoLoadRef.current = true
    void ensureLoaded(DEFAULT_MODEL_ID).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setMockForced = useCallback((v: boolean) => {
    epochRef.current += 1
    loadedModelRef.current = null
    loadingRef.current = null
    backendRef.current?.unload().catch(() => undefined)
    backendRef.current = null
    setState((s) => ({ ...s, mockForced: v, engineState: 'idle', loadProgress: null }))
  }, [])

  const store: Store = {
    ...state,
    model: modelById(state.modelId),
    selectModel,
    setSampling,
    send,
    reroll,
    stop,
    setSelected,
    setMockForced,
    setEngineChoice,
  }
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('store missing')
  return s
}

export type { ChatTurn, ModelSpec, SamplingParams, TokenEvent }
export { CATALOG }
