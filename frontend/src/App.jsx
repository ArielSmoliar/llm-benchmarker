import { useState, useEffect, useRef } from 'react'
import ModelSelector from './components/ModelSelector'
import PromptInput from './components/PromptInput'
import ResultCard from './components/ResultCard'
import LatencyChart, { TokenChart } from './components/LatencyChart'

const STORAGE_KEY = 'llm-benchmarker:selected-models'
const HISTORY_KEY = 'llm-benchmarker:run-history'
const MAX_HISTORY = 20

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function persistHistory(runs) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(runs))
}

const FAILED_MODELS_KEY = 'llm-benchmarker:failed-models'
const FAILED_MODEL_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function loadFailedModels() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAILED_MODELS_KEY) || '{}')
    const now = Date.now()
    return Object.fromEntries(
      Object.entries(raw).filter(([, v]) => now - v.ts < FAILED_MODEL_TTL_MS)
    )
  } catch { return {} }
}
function persistFailedModels(map) {
  localStorage.setItem(FAILED_MODELS_KEY, JSON.stringify(map))
}

function getUrlParams() {
  const p = new URLSearchParams(window.location.search)
  return {
    prompt: p.get('p') || '',
    models: p.get('m') ? p.get('m').split(',').filter(Boolean) : [],
  }
}

function setUrlParams(prompt, models) {
  const p = new URLSearchParams()
  if (prompt) p.set('p', prompt)
  if (models.length) p.set('m', models.join(','))
  const qs = p.toString()
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
}

function gridClass(count) {
  if (count === 1) return 'grid-cols-1 max-w-2xl mx-auto'
  if (count === 2) return 'grid-cols-2'
  if (count === 3) return 'grid-cols-3'
  return 'grid-cols-2 xl:grid-cols-4'
}

export default function App() {
  const [modelGroups, setModelGroups] = useState([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [modelsError, setModelsError] = useState(null)

  const [selectedModels, setSelectedModels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
      return []
    }
  })

  const urlParamsApplied = useRef(false)

  const [prompt, setPrompt] = useState(() => getUrlParams().prompt)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)

  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(1024)

  const [benchmarking, setBenchmarking] = useState(false)
  const [results, setResults] = useState([])
  const [streamingModels, setStreamingModels] = useState(new Set())
  const [benchmarkError, setBenchmarkError] = useState(null)

  const [votes, setVotes] = useState({}) // { [model_id]: 'up' | 'down' | null }
  const [regenerating, setRegenerating] = useState(new Set())

  const [judgeModel, setJudgeModel] = useState('')
  const [judging, setJudging] = useState(false)
  const [judgeScores, setJudgeScores] = useState([])
  const [judgeError, setJudgeError] = useState(null)

  const [history, setHistory] = useState(loadHistory)
  const [showHistory, setShowHistory] = useState(false)
  const [activeRunId, setActiveRunId] = useState(null)

  const [failedModels, setFailedModels] = useState(loadFailedModels)

  // Fetch available models on mount
  useEffect(() => {
    fetchModels()
  }, [])

  // Persist selected models to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedModels))
  }, [selectedModels])

  // Apply URL model params once after model list loads
  useEffect(() => {
    if (modelGroups.length > 0 && !urlParamsApplied.current) {
      urlParamsApplied.current = true
      const { models: urlModels } = getUrlParams()
      if (urlModels.length > 0) {
        const allIds = modelGroups.flatMap((g) => g.models.map((m) => m.id))
        const valid = urlModels.filter((id) => allIds.includes(id))
        if (valid.length > 0) setSelectedModels(valid)
      }
    }
  }, [modelGroups])

  // Auto-select a default judge model (prefer 70b+)
  useEffect(() => {
    if (modelGroups.length > 0 && !judgeModel) {
      const all = modelGroups.flatMap((g) => g.models)
      const preferred = all.find((m) => /70b|nemotron|405b/i.test(m.id))
      setJudgeModel(preferred?.id || all[0]?.id || '')
    }
  }, [modelGroups])

  async function fetchModels() {
    setLoadingModels(true)
    setModelsError(null)
    try {
      const res = await fetch('/api/models')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setModelGroups(data.groups)

      // Remove any persisted selections that no longer exist
      const allIds = data.groups.flatMap((g) => g.models.map((m) => m.id))
      setSelectedModels((prev) => prev.filter((id) => allIds.includes(id)))
    } catch (err) {
      setModelsError(err.message)
    } finally {
      setLoadingModels(false)
    }
  }

  async function runJudge() {
    if (!judgeModel || judging || results.length === 0) return
    setJudging(true)
    setJudgeScores([])
    setJudgeError(null)
    try {
      const res = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge_model: judgeModel,
          prompt: prompt.trim(),
          results,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setJudgeScores(data.scores)
      if (activeRunId) {
        setHistory((prev) => {
          const next = prev.map((r) => r.id === activeRunId ? { ...r, judgeScores: data.scores } : r)
          persistHistory(next)
          return next
        })
      }
    } catch (err) {
      setJudgeError(err.message)
    } finally {
      setJudging(false)
    }
  }

  async function runBenchmark() {
    if (!prompt.trim() || selectedModels.length === 0 || benchmarking) return
    setBenchmarking(true)
    setBenchmarkError(null)
    setJudgeScores([])
    setJudgeError(null)
    setVotes({})
    setRegenerating(new Set())

    // Show empty cards immediately
    const resultMap = Object.fromEntries(
      selectedModels.map((id) => [id, { model_id: id, content: '', latency_ms: null, prompt_tokens: null, completion_tokens: null, total_tokens: null, error: null }])
    )
    setResults(Object.values(resultMap))
    setStreamingModels(new Set(selectedModels))

    try {
      const res = await fetch('/api/benchmark/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: selectedModels,
          prompt: prompt.trim(),
          system_prompt: showSystemPrompt && systemPrompt.trim() ? systemPrompt.trim() : undefined,
          temperature,
          max_tokens: maxTokens,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue
          let event
          try { event = JSON.parse(raw) } catch { continue }

          if (!event.done && event.chunk) {
            resultMap[event.model_id].content = (resultMap[event.model_id].content || '') + event.chunk
            setResults(Object.values(resultMap).map((r) => ({ ...r })))
          } else if (event.done) {
            resultMap[event.model_id] = {
              ...resultMap[event.model_id],
              latency_ms: event.latency_ms ?? null,
              prompt_tokens: event.usage?.prompt_tokens ?? null,
              completion_tokens: event.usage?.completion_tokens ?? null,
              total_tokens: event.usage?.total_tokens ?? null,
              error: event.error ?? null,
              content: event.error ? null : resultMap[event.model_id].content,
            }
            setResults(Object.values(resultMap).map((r) => ({ ...r })))
            setStreamingModels((prev) => { const next = new Set(prev); next.delete(event.model_id); return next })
          }
        }
      }

      const finalResults = Object.values(resultMap)
      setUrlParams(prompt.trim(), selectedModels)
      setFailedModels((prev) => {
        const next = { ...prev }
        for (const r of finalResults) {
          if (r.error) next[r.model_id] = { ts: Date.now(), error: r.error }
          else delete next[r.model_id]
        }
        persistFailedModels(next)
        return next
      })
      const run = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        prompt: prompt.trim(),
        systemPrompt: showSystemPrompt ? systemPrompt.trim() : '',
        models: selectedModels,
        results: finalResults,
        judgeScores: [],
      }
      setActiveRunId(run.id)
      setHistory((prev) => {
        const next = [run, ...prev].slice(0, MAX_HISTORY)
        persistHistory(next)
        return next
      })
    } catch (err) {
      setBenchmarkError(err.message)
      setStreamingModels(new Set())
    } finally {
      setBenchmarking(false)
      setStreamingModels(new Set())
    }
  }

  function handleVote(modelId, dir) {
    setVotes((prev) => ({ ...prev, [modelId]: prev[modelId] === dir ? null : dir }))
  }

  async function regenerateModel(modelId) {
    if (regenerating.has(modelId)) return
    setRegenerating((prev) => new Set([...prev, modelId]))
    setJudgeScores((prev) => prev.filter((s) => s.model_id !== modelId))
    setVotes((prev) => { const next = { ...prev }; delete next[modelId]; return next })

    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: [modelId],
          prompt: prompt.trim(),
          system_prompt: showSystemPrompt && systemPrompt.trim() ? systemPrompt.trim() : undefined,
          temperature,
          max_tokens: maxTokens,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setResults((prev) => prev.map((r) => r.model_id === modelId ? data.results[0] : r))
    } catch (err) {
      setResults((prev) => prev.map((r) => r.model_id === modelId ? { ...r, content: null, error: err.message } : r))
    } finally {
      setRegenerating((prev) => { const next = new Set(prev); next.delete(modelId); return next })
    }
  }

  function restoreRun(run) {
    setPrompt(run.prompt)
    setSystemPrompt(run.systemPrompt || '')
    setShowSystemPrompt(!!run.systemPrompt)
    setSelectedModels(run.models)
    setResults(run.results)
    setJudgeScores(run.judgeScores || [])
    setJudgeError(null)
    setVotes({})
    setRegenerating(new Set())
    setActiveRunId(run.id)
    setShowHistory(false)
  }

  function deleteRun(id) {
    setHistory((prev) => {
      const next = prev.filter((r) => r.id !== id)
      persistHistory(next)
      return next
    })
    if (activeRunId === id) setActiveRunId(null)
  }

  const canRun = !benchmarking && selectedModels.length > 0 && prompt.trim().length > 0

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(124,106,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,247,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-[#1e1e2e] bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">LLM Benchmarker</h1>
              <p className="text-[11px] text-gray-500 mt-0.5">Compare AI models side-by-side</p>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <button
                onClick={() => setShowHistory(true)}
                className="relative inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History
                {history.length > 0 && (
                  <span className="text-[10px] font-mono bg-[#1e1e2e] px-1.5 py-0.5 rounded-full">{history.length}</span>
                )}
              </button>
              <a
                href="https://build.nvidia.com/models"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-gray-300 font-mono"
              >
                browse models ↗
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-6">
          <ModelSelector
            groups={modelGroups}
            selected={selectedModels}
            onChange={setSelectedModels}
            loading={loadingModels}
            error={modelsError}
            onRetry={fetchModels}
            failedModels={failedModels}
          />

          <PromptInput
            prompt={prompt}
            onPromptChange={setPrompt}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            showSystemPrompt={showSystemPrompt}
            onToggleSystemPrompt={() => setShowSystemPrompt((v) => !v)}
            temperature={temperature}
            onTemperatureChange={setTemperature}
            maxTokens={maxTokens}
            onMaxTokensChange={setMaxTokens}
          />

          {/* Run button */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={runBenchmark}
              disabled={!canRun}
              className="inline-flex items-center gap-2 px-7 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow-lg shadow-purple-900/30"
            >
              {benchmarking ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Running benchmark…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Benchmark
                </>
              )}
            </button>
            {selectedModels.length === 0 && !benchmarking && (
              <p className="text-xs text-gray-600">Select at least one model to continue</p>
            )}
          </div>

          {/* Global benchmark error */}
          {benchmarkError && (
            <div className="flex items-center gap-2 p-4 bg-red-950/30 border border-red-900 rounded-xl text-red-400 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {benchmarkError}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-white">Results</h2>
                <span className="text-xs font-mono text-gray-600">
                  {results.filter((r) => !r.error).length}/{results.length} succeeded
                </span>
                <CopyLinkButton />
              </div>

              {/* Judge panel */}
              <JudgePanel
                modelGroups={modelGroups}
                judgeModel={judgeModel}
                onJudgeModelChange={setJudgeModel}
                onEvaluate={runJudge}
                judging={judging}
                judgeError={judgeError}
                hasScores={judgeScores.length > 0}
              />

              {/* Result cards */}
              {(() => {
                const scoreMap = Object.fromEntries(judgeScores.map((s) => [s.model_id, s]))
                const avgScore = (s) =>
                  s && !s.error ? ((s.accuracy || 0) + (s.clarity || 0) + (s.conciseness || 0)) / 3 : 0
                const winnerId =
                  judgeScores.length > 0
                    ? judgeScores.reduce((best, s) => (avgScore(s) > avgScore(best) ? s : best), judgeScores[0])
                        ?.model_id
                    : null
                return (
                  <div className={`grid gap-4 w-full ${gridClass(results.length)}`}>
                    {results.map((result) => (
                      <ResultCard
                        key={result.model_id}
                        result={result}
                        judgeScores={scoreMap[result.model_id]}
                        isWinner={!!winnerId && result.model_id === winnerId}
                        vote={votes[result.model_id] ?? null}
                        onVote={(dir) => handleVote(result.model_id, dir)}
                        isRegenerating={regenerating.has(result.model_id)}
                        onRegenerate={() => regenerateModel(result.model_id)}
                        isStreaming={streamingModels.has(result.model_id)}
                      />
                    ))}
                  </div>
                )
              })()}

              <LatencyChart results={results} />
              <TokenChart results={results} />
            </section>
          )}

        </main>

        <HistoryDrawer
          open={showHistory}
          onClose={() => setShowHistory(false)}
          history={history}
          activeRunId={activeRunId}
          onRestore={restoreRun}
          onDelete={deleteRun}
          onClearAll={() => {
            setHistory([])
            persistHistory([])
            setActiveRunId(null)
          }}
        />

        <footer className="border-t border-[#1e1e2e] px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <p className="text-[11px] text-gray-600">
              Powered by{' '}
              <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
                NVIDIA NIM
              </a>
            </p>
            <p className="text-[11px] text-gray-600">No data leaves your machine</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-300"
      title="Copy shareable link"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Copy link
        </>
      )}
    </button>
  )
}

function HistoryDrawer({ open, onClose, history, activeRunId, onRestore, onDelete, onClearAll }) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
        />
      )}
      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-[#0d0d15] border-l border-[#1e1e2e] z-40 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
          <div>
            <p className="text-sm font-semibold text-white">Run History</p>
            <p className="text-[11px] text-gray-500">{history.length} saved run{history.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button
                onClick={onClearAll}
                className="text-[11px] text-gray-600 hover:text-red-400"
              >
                Clear all
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-600 text-xs">
              <svg className="w-8 h-8 mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No runs yet
            </div>
          ) : (
            history.map((run) => (
              <HistoryEntry
                key={run.id}
                run={run}
                isActive={run.id === activeRunId}
                onRestore={() => onRestore(run)}
                onDelete={() => onDelete(run.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function HistoryEntry({ run, isActive, onRestore, onDelete }) {
  const succeeded = run.results.filter((r) => !r.error).length
  const date = new Date(run.timestamp)
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const hasScores = run.judgeScores?.length > 0

  return (
    <div
      className={`px-5 py-4 border-b border-[#1e1e2e] cursor-pointer hover:bg-[#13131a] ${
        isActive ? 'bg-[#13131a] border-l-2 border-l-purple-600' : ''
      }`}
      onClick={onRestore}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-300 leading-snug line-clamp-2 flex-1">{run.prompt}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-gray-700 hover:text-red-400 flex-shrink-0 p-0.5"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-600 font-mono">{dateStr} {timeStr}</span>
        <span className="text-[10px] text-gray-600">·</span>
        <span className="text-[10px] text-gray-500">{succeeded}/{run.results.length} ok</span>
        {hasScores && (
          <>
            <span className="text-[10px] text-gray-600">·</span>
            <span className="text-[10px] text-purple-500">evaluated</span>
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {run.models.slice(0, 3).map((m) => (
          <span key={m} className="text-[10px] font-mono bg-[#1a1a2e] text-gray-500 px-1.5 py-0.5 rounded">
            {m.split('/').pop()}
          </span>
        ))}
        {run.models.length > 3 && (
          <span className="text-[10px] font-mono text-gray-600">+{run.models.length - 3}</span>
        )}
      </div>
    </div>
  )
}

function JudgePanel({ modelGroups, judgeModel, onJudgeModelChange, onEvaluate, judging, judgeError, hasScores }) {
  const allModels = modelGroups.flatMap((g) => g.models)
  return (
    <div className="border border-[#1e1e2e] bg-[#0d0d15] rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-200">Auto-evaluate</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            A judge model scores each response on accuracy, clarity, and conciseness (1–5)
          </p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
          <select
            value={judgeModel}
            onChange={(e) => onJudgeModelChange(e.target.value)}
            disabled={judging}
            className="bg-[#13131a] border border-[#1e1e2e] text-xs text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-purple-700 disabled:opacity-40 max-w-[260px] truncate"
          >
            {allModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
          <button
            onClick={onEvaluate}
            disabled={judging || !judgeModel}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#13131a] hover:bg-[#1a1a2e] disabled:opacity-40 disabled:cursor-not-allowed border border-purple-800/50 text-purple-300 text-xs font-medium rounded-lg whitespace-nowrap"
          >
            {judging ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Evaluating…
              </>
            ) : hasScores ? (
              'Re-evaluate'
            ) : (
              'Evaluate'
            )}
          </button>
        </div>
      </div>
      {judgeError && (
        <p className="mt-2 text-xs text-red-400">
          Judge error: {judgeError}
        </p>
      )}
    </div>
  )
}

function SkeletonCard({ modelId }) {
  const parts = modelId.split('/')
  const name = parts[parts.length - 1]
  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-[#1e1e2e]">
        <p className="text-xs text-gray-500 truncate">{name}</p>
      </div>
      <div className="p-4 space-y-2">
        <div className="h-3 bg-gray-800 rounded w-full" />
        <div className="h-3 bg-gray-800 rounded w-5/6" />
        <div className="h-3 bg-gray-800 rounded w-4/6" />
        <div className="h-3 bg-gray-800 rounded w-3/4" />
      </div>
    </div>
  )
}
