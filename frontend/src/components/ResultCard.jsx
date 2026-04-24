import { useState } from 'react'

export default function ResultCard({ result }) {
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
        result.error ? 'border-red-900/60' : 'border-[#1e1e2e]'
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
          <p
            className="text-sm font-medium text-white leading-tight truncate"
            title={modelName}
          >
            {modelName}
          </p>
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
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {result.content}
          </p>
        )}
      </div>
    </div>
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
