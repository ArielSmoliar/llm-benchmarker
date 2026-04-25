import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ResultCard({ result, judgeScores, isWinner }) {
  const [copied, setCopied] = useState(false)

  async function copyToClipboard() {
    if (!result.content) return
    try {
      await navigator.clipboard.writeText(result.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  const parts = result.model_id.split('/')
  const provider = parts.length > 1 ? parts[0] : null
  const modelName = parts[parts.length - 1]

  return (
    <div
      className={`flex flex-col bg-[#13131a] rounded-xl border overflow-hidden ${
        isWinner
          ? 'border-purple-600/60 shadow-lg shadow-purple-900/20'
          : result.error
          ? 'border-red-900/60'
          : 'border-[#1e1e2e]'
      }`}
    >
      {/* Card header */}
      <div className="px-4 py-3 border-b border-[#1e1e2e] flex items-start justify-between gap-3">
        <div className="min-w-0">
          {provider && (
            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-0.5">
              {provider}
            </p>
          )}
          <div className="flex items-center gap-2">
            <p
              className="text-sm font-medium text-white leading-tight truncate"
              title={modelName}
            >
              {modelName}
            </p>
            {isWinner && (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-purple-900/40 border border-purple-700/50 text-purple-300 rounded">
                Best
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {result.latency_ms != null && (
            <span className="text-[11px] font-mono px-2 py-1 bg-[#0f0f17] border border-[#1e1e2e] text-gray-400 rounded">
              {result.latency_ms >= 1000
                ? `${(result.latency_ms / 1000).toFixed(2)}s`
                : `${Math.round(result.latency_ms)}ms`}
            </span>
          )}
          {result.content && (
            <button
              onClick={copyToClipboard}
              title={copied ? 'Copied!' : 'Copy response'}
              className="p-1.5 rounded hover:bg-[#1a1a2e] text-gray-500 hover:text-gray-300"
            >
              {copied ? (
                <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Token counts */}
      {result.total_tokens != null && (
        <div className="px-4 py-2 border-b border-[#1e1e2e] flex items-center gap-4">
          <TokenBadge label="prompt" value={result.prompt_tokens} />
          <TokenBadge label="completion" value={result.completion_tokens} />
          <TokenBadge label="total" value={result.total_tokens} highlight />
        </div>
      )}

      {/* Judge scores */}
      {judgeScores && !judgeScores.error && (
        <div className="px-4 py-2.5 border-b border-[#1e1e2e] space-y-2">
          <div className="flex items-center gap-3">
            <ScorePill label="Accuracy" value={judgeScores.accuracy} />
            <ScorePill label="Clarity" value={judgeScores.clarity} />
            <ScorePill label="Conciseness" value={judgeScores.conciseness} />
          </div>
          {judgeScores.reasoning && (
            <p className="text-[11px] text-gray-500 leading-relaxed italic">
              {judgeScores.reasoning}
            </p>
          )}
        </div>
      )}
      {judgeScores?.error && (
        <div className="px-4 py-2 border-b border-[#1e1e2e]">
          <p className="text-[11px] text-yellow-600">{judgeScores.error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto max-h-80 min-h-[6rem]">
        {result.error ? (
          <div className="flex items-start gap-2 text-red-400">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm leading-relaxed">{result.error}</span>
          </div>
        ) : (
          <div className="prose-sm prose-invert prose-p:text-gray-300 prose-headings:text-white prose-headings:font-semibold prose-strong:text-gray-200 prose-code:text-purple-300 prose-code:bg-[#0f0f17] prose-code:px-1 prose-code:rounded prose-pre:bg-[#0f0f17] prose-pre:border prose-pre:border-[#1e1e2e] prose-ol:text-gray-300 prose-ul:text-gray-300 prose-li:text-gray-300 max-w-none text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

function ScorePill({ label, value }) {
  if (value == null) return null
  const color =
    value >= 4 ? 'text-green-400 border-green-900/50 bg-green-950/30' :
    value === 3 ? 'text-yellow-400 border-yellow-900/50 bg-yellow-950/20' :
    'text-red-400 border-red-900/50 bg-red-950/20'
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${color}`}>
      <span className="text-gray-500 font-sans">{label}</span>
      <span className="font-semibold">{value}/5</span>
    </span>
  )
}

function TokenBadge({ label, value, highlight }) {
  if (value == null) return null
  return (
    <span className="text-xs text-gray-500">
      <span className={highlight ? 'text-gray-300 font-medium' : 'text-gray-400'}>
        {value.toLocaleString()}
      </span>{' '}
      {label}
    </span>
  )
}
