import { useState, useEffect } from 'react'
import ModelSelector from './components/ModelSelector'
import PromptInput from './components/PromptInput'
import ResultCard from './components/ResultCard'
import LatencyChart from './components/LatencyChart'

const STORAGE_KEY = 'llm-benchmarker:selected-models'

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

  const [prompt, setPrompt] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)

  const [benchmarking, setBenchmarking] = useState(false)
  const [results, setResults] = useState([])
  const [benchmarkError, setBenchmarkError] = useState(null)

  const [judgeModel, setJudgeModel] = useState('')
  const [judging, setJudging] = useState(false)
  const [judgeScores, setJudgeScores] = useState([])
  const [judgeError, setJudgeError] = useState(null)

  // Fetch available models on mount
  useEffect(() => {
    fetchModels()
  }, [])

  // Persist selected models to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedModels))
  }, [selectedModels])

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
    } catch (err) {
      setJudgeError(err.message)
    } finally {
      setJudging(false)
    }
  }

  async function runBenchmark() {
    if (!prompt.trim() || selectedModels.length === 0 || benchmarking) return
    setBenchmarking(true)
    setResults([])
    setBenchmarkError(null)
    setJudgeScores([])
    setJudgeError(null)

    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: selectedModels,
          prompt: prompt.trim(),
          system_prompt: showSystemPrompt && systemPrompt.trim() ? systemPrompt.trim() : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setResults(data.results)
    } catch (err) {
      setBenchmarkError(err.message)
    } finally {
      setBenchmarking(false)
    }
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
            <div className="ml-auto">
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
          />

          <PromptInput
            prompt={prompt}
            onPromptChange={setPrompt}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            showSystemPrompt={showSystemPrompt}
            onToggleSystemPrompt={() => setShowSystemPrompt((v) => !v)}
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
                      />
                    ))}
                  </div>
                )
              })()}

              <LatencyChart results={results} />
            </section>
          )}

          {/* Loading skeleton cards */}
          {benchmarking && selectedModels.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                <span className="text-xs text-gray-500">
                  Querying {selectedModels.length} model{selectedModels.length > 1 ? 's' : ''} in parallel…
                </span>
              </div>
              <div className={`grid gap-4 ${gridClass(selectedModels.length)}`}>
                {selectedModels.map((id) => (
                  <SkeletonCard key={id} modelId={id} />
                ))}
              </div>
            </section>
          )}
        </main>

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
