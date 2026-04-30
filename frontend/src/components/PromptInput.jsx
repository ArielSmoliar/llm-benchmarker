import { useState } from 'react'

export default function PromptInput({
  prompt,
  onPromptChange,
  systemPrompt,
  onSystemPromptChange,
  showSystemPrompt,
  onToggleSystemPrompt,
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
}) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white text-base">Prompt</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showSettings
                ? 'border-purple-500 bg-purple-900/20 text-purple-300'
                : 'border-[#1e1e2e] text-gray-500 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Settings
          </button>
          <button
            onClick={onToggleSystemPrompt}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showSystemPrompt
                ? 'border-purple-500 bg-purple-900/20 text-purple-300'
                : 'border-[#1e1e2e] text-gray-500 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                showSystemPrompt ? 'bg-purple-400' : 'bg-gray-600'
              }`}
            />
            System Prompt
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="grid grid-cols-2 gap-6 p-4 bg-[#0a0a0f] rounded-lg border border-[#1e1e2e]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                Temperature
              </label>
              <span className="text-xs font-mono text-purple-300">{temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-600">Precise</span>
              <span className="text-[10px] text-gray-600">Creative</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                Max Tokens
              </label>
              <span className="text-xs font-mono text-purple-300">{maxTokens.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="256"
              max="4096"
              step="256"
              value={maxTokens}
              onChange={(e) => onMaxTokensChange(parseInt(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-600">256</span>
              <span className="text-[10px] text-gray-600">4096</span>
            </div>
          </div>
        </div>
      )}

      {showSystemPrompt && (
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
            System
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            placeholder="You are a helpful assistant…"
            rows={3}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm text-gray-300 placeholder-gray-700 resize-none focus:outline-none focus:border-purple-600"
          />
        </div>
      )}

      <div>
        {showSystemPrompt && (
          <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
            User
          </label>
        )}
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Enter your prompt here…"
          rows={6}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm text-gray-300 placeholder-gray-700 resize-none focus:outline-none focus:border-purple-600"
        />
      </div>
    </div>
  )
}
