const AREAS = [
  'Mental math', 'Word problems', 'Fractions', 'Equations',
  'Graphing', 'Proofs', 'Formulas', 'Estimation',
  'Geometry', 'Derivatives', 'Integrals', 'Matrices',
]

interface Step3Props {
  strengthAreas: string[]
  weaknessAreas: string[]
  onChange: (field: string, value: string[]) => void
}

export function Step3({ strengthAreas, weaknessAreas, onChange }: Step3Props) {
  const toggle = (area: string, field: 'strengthAreas' | 'weaknessAreas', current: string[]) => {
    const updated = current.includes(area)
      ? current.filter((a) => a !== area)
      : [...current, area]
    onChange(field, updated)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">⚡</div>
        <h2 className="text-2xl font-bold text-stone-900">Strengths & growth areas</h2>
        <p className="text-stone-500 mt-2">Honesty helps Socra personalize better</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-green-700 mb-2">✅ I&apos;m good at</label>
          <div className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => toggle(a, 'strengthAreas', strengthAreas)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  strengthAreas.includes(a)
                    ? 'bg-green-100 text-green-700 border-green-400'
                    : 'border-stone-200 text-stone-500 hover:border-green-300'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-orange-700 mb-2">🔥 I want to improve</label>
          <div className="flex flex-wrap gap-1.5">
            {AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => toggle(a, 'weaknessAreas', weaknessAreas)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  weaknessAreas.includes(a)
                    ? 'bg-orange-100 text-orange-700 border-orange-400'
                    : 'border-stone-200 text-stone-500 hover:border-orange-300'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
