const MAX_MODELS = 5

export default function ModelSelector({ groups, selected, onChange, loading, error, onRetry }) {
  const isMaxReached = selected.length >= MAX_MODELS

  function toggle(modelId) {
    if (selected.includes(modelId)) {
      onChange(selected.filter((id) => id !== modelId))
    } else if (!isMaxReached) {
      onChange([...selected, modelId])
    }
  }

  return (
    <div className="bg-[#13131a] border border-[#1e1e2e] rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-semibold text-white text-base">Select Models</h2>
          <p className="text-xs text-gray-500 mt-0.5">Choose up to 5 models to compare</p>
        </div>
        <span
          className={`text-xs font-mono px-2.5 py-1 rounded-md border ${
            isMaxReached
              ? 'bg-purple-900/30 border-purple-700 text-purple-300'
              : 'bg-gray-900 border-gray-700 text-gray-400'
          }`}
        >
          {selected.length}/{MAX_MODELS} selected
        </span>
      </div>

      {loading && (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-3 bg-gray-800 rounded w-20 mb-3" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-9 bg-gray-800 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-4 bg-red-950/30 border border-red-900 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Failed to load models: {error}
          </div>
          <button
            onClick={onRetry}
            className="text-xs text-purple-400 hover:text-purple-300 ml-4 flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">
          No chat-compatible models found. Check your API key.
        </p>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="space-y-5 max-h-72 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.provider}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2.5">
                {group.provider}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {group.models.map((model) => {
                  const isSelected = selected.includes(model.id)
                  const isDisabled = isMaxReached && !isSelected
                  return (
                    <label
                      key={model.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer select-none ${
                        isSelected
                          ? 'border-purple-500 bg-purple-900/20 text-purple-200'
                          : isDisabled
                          ? 'border-[#1e1e2e] bg-[#0f0f17] text-gray-600 cursor-not-allowed'
                          : 'border-[#1e1e2e] hover:border-gray-600 text-gray-300 hover:bg-[#1a1a2e]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => toggle(model.id)}
                        className="sr-only"
                      />
                      {/* Custom checkbox */}
                      <span
                        className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center ${
                          isSelected
                            ? 'bg-purple-600 border-purple-500'
                            : isDisabled
                            ? 'border-gray-700 bg-gray-900'
                            : 'border-gray-600'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                            <path
                              d="M1.5 5l2.5 2.5 4.5-4.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{model.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
