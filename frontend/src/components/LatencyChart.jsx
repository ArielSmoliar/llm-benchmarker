export function TokenChart({ results }) {
  const valid = results.filter((r) => r.completion_tokens != null && r.latency_ms != null)
  if (valid.length < 2) return null

  const sorted = [...valid].sort((a, b) => a.completion_tokens - b.completion_tokens)
  const maxTokens = sorted[sorted.length - 1].completion_tokens
  const avgTokens = valid.reduce((s, r) => s + r.completion_tokens, 0) / valid.length
  const best = sorted[0]
  const showRecommendation = best.completion_tokens < avgTokens * 0.75

  function barColor(tokens) {
    const ratio = tokens / maxTokens
    if (ratio <= 0.4) return 'bg-green-500'
    if (ratio <= 0.7) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <h3 className="text-sm font-semibold text-white">Token Usage</h3>
        <span className="text-xs text-gray-600 font-mono">— completion tokens, fewest first</span>
      </div>

      <div className="space-y-3">
        {sorted.map((r, i) => {
          const parts = r.model_id.split('/')
          const label = parts[parts.length - 1]
          const widthPct = Math.max((r.completion_tokens / maxTokens) * 100, 4)
          const showInBar = widthPct > 28
          const tokensPerSec = r.latency_ms > 0
            ? Math.round((r.completion_tokens / (r.latency_ms / 1000)))
            : null

          return (
            <div key={r.model_id} className="flex items-center gap-3">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  i === 0
                    ? 'bg-green-500/20 text-green-400'
                    : i === sorted.length - 1
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                {i + 1}
              </span>

              <div className="w-44 text-right flex-shrink-0">
                <span className="text-xs text-gray-400 font-mono truncate block" title={label}>
                  {label}
                </span>
              </div>

              <div className="flex-1 bg-[#0f0f17] rounded-full h-6 overflow-hidden border border-[#1e1e2e]">
                <div
                  className={`h-full ${barColor(r.completion_tokens)} rounded-full flex items-center justify-end pr-2`}
                  style={{ width: `${widthPct}%`, transition: 'width 0.6s ease' }}
                >
                  {showInBar && (
                    <span className="text-[10px] text-white font-mono font-semibold">
                      {r.completion_tokens.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="w-28 flex-shrink-0 flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400 w-14 text-right">
                  {r.completion_tokens.toLocaleString()} tok
                </span>
                {tokensPerSec != null && (
                  <span className="text-[10px] font-mono text-gray-600">
                    {tokensPerSec}/s
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#1e1e2e]">
        <Legend color="bg-green-500" label="Fewest (≤40%)" />
        <Legend color="bg-amber-500" label="Medium (40–70%)" />
        <Legend color="bg-red-500" label="Most (>70%)" />
      </div>

      {showRecommendation && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-green-950/20 border border-green-900/40 rounded-lg">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div>
            <p className="text-xs text-green-400 font-medium">
              Most token-efficient: {best.model_id.split('/').pop()}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Used {best.completion_tokens.toLocaleString()} completion tokens —{' '}
              {Math.round((1 - best.completion_tokens / avgTokens) * 100)}% fewer than average.
              Consider it for cost-sensitive or high-volume use cases.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LatencyChart({ results }) {
  const valid = results.filter((r) => r.latency_ms != null)
  if (valid.length < 2) return null

  const sorted = [...valid].sort((a, b) => a.latency_ms - b.latency_ms)
  const maxLatency = sorted[sorted.length - 1].latency_ms

  function barColor(latency) {
    const ratio = latency / maxLatency
    if (ratio <= 0.4) return 'bg-green-500'
    if (ratio <= 0.7) return 'bg-amber-500'
    return 'bg-red-500'
  }

  function formatLatency(ms) {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
    return `${Math.round(ms)}ms`
  }

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <h3 className="text-sm font-semibold text-white">Latency Comparison</h3>
        <span className="text-xs text-gray-600 font-mono">— fastest first</span>
      </div>

      <div className="space-y-3">
        {sorted.map((r, i) => {
          const parts = r.model_id.split('/')
          const label = parts[parts.length - 1]
          const widthPct = Math.max((r.latency_ms / maxLatency) * 100, 4)
          const showInBar = widthPct > 28

          return (
            <div key={r.model_id} className="flex items-center gap-3">
              {/* Rank badge */}
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  i === 0
                    ? 'bg-green-500/20 text-green-400'
                    : i === sorted.length - 1
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                {i + 1}
              </span>

              {/* Model name */}
              <div className="w-44 text-right flex-shrink-0">
                <span className="text-xs text-gray-400 font-mono truncate block" title={label}>
                  {label}
                </span>
              </div>

              {/* Bar */}
              <div className="flex-1 bg-[#0f0f17] rounded-full h-6 overflow-hidden border border-[#1e1e2e]">
                <div
                  className={`h-full ${barColor(r.latency_ms)} rounded-full flex items-center justify-end pr-2`}
                  style={{
                    width: `${widthPct}%`,
                    transition: 'width 0.6s ease',
                  }}
                >
                  {showInBar && (
                    <span className="text-[10px] text-white font-mono font-semibold">
                      {formatLatency(r.latency_ms)}
                    </span>
                  )}
                </div>
              </div>

              {/* Value outside bar */}
              <div className="w-16 flex-shrink-0">
                <span className="text-xs font-mono text-gray-400">{formatLatency(r.latency_ms)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#1e1e2e]">
        <Legend color="bg-green-500" label="Fastest (≤40%)" />
        <Legend color="bg-amber-500" label="Medium (40–70%)" />
        <Legend color="bg-red-500" label="Slowest (>70%)" />
      </div>
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  )
}
