const STYLES = [
  { id: 'visual', icon: '🎨', label: 'Visual', desc: 'Diagrams, graphs, and visual patterns' },
  { id: 'step-by-step', icon: '📋', label: 'Step-by-step', desc: 'Clear logical sequences' },
  { id: 'conceptual', icon: '💡', label: 'Conceptual', desc: 'Understanding the "why"' },
  { id: 'practice', icon: '🏋️', label: 'Practice-heavy', desc: 'Learning by doing many problems' },
]

interface Step4Props {
  learningStyle: string
  goals: string
  onChange: (field: string, value: string) => void
}

export function Step4({ learningStyle, goals, onChange }: Step4Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🎯</div>
        <h2 className="text-2xl font-bold text-stone-900">Your learning style</h2>
        <p className="text-stone-500 mt-2">Socra adapts its teaching to how you learn best</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">How do you learn best?</label>
        <div className="grid grid-cols-2 gap-3">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange('learningStyle', s.id)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                learningStyle === s.id
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-stone-200 hover:border-orange-300'
              }`}
            >
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="font-semibold text-stone-900 text-sm">{s.label}</div>
              <div className="text-xs text-stone-500 mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          What&apos;s your main math goal?
        </label>
        <textarea
          className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 text-stone-900 bg-white resize-none"
          rows={3}
          placeholder="e.g. Pass my Algebra II exam, understand calculus for college, improve SAT math score..."
          value={goals}
          onChange={(e) => onChange('goals', e.target.value)}
        />
      </div>
    </div>
  )
}
