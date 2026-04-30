import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ResultCard({ result, judgeScores, isWinner, vote, onVote, isRegenerating, onRegenerate, isStreaming }) {
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
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            title="Regenerate response"
            className="p-1.5 rounded hover:bg-[#1a1a2e] text-gray-600 hover:text-gray-300 disabled:opacity-40"
          >
            <svg className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {result.content && (
            <>
              <button
                onClick={() => onVote('up')}
                title="Good response"
                className={`p-1.5 rounded ${vote === 'up' ? 'text-green-400 bg-green-950/40' : 'text-gray-600 hover:text-gray-300 hover:bg-[#1a1a2e]'}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={vote === 'up' ? 'currentColor' : 'none'} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>
              <button
                onClick={() => onVote('down')}
                title="Poor response"
                className={`p-1.5 rounded ${vote === 'down' ? 'text-red-400 bg-red-950/40' : 'text-gray-600 hover:text-gray-300 hover:bg-[#1a1a2e]'}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={vote === 'down' ? 'currentColor' : 'none'} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                </svg>
              </button>
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
            </>
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
      <div className="flex-1 p-4 overflow-y-auto max-h-80 min-h-[6rem] relative">
        {isRegenerating && (
          <div className="absolute inset-0 bg-[#13131a]/80 flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Regenerating…
            </div>
          </div>
        )}
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
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-purple-400 ml-0.5 align-middle animate-pulse" />
            )}
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
