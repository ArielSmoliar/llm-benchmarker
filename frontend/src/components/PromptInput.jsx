export default function PromptInput({
  prompt,
  onPromptChange,
  systemPrompt,
  onSystemPromptChange,
  showSystemPrompt,
  onToggleSystemPrompt,
}) {
  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white text-base">Prompt</h2>
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
