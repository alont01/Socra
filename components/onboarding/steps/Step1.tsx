interface Step1Props {
  name: string
  role: 'STUDENT' | 'PARENT'
  onChange: (field: string, value: string) => void
}

export function Step1({ name, role, onChange }: Step1Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">👋</div>
        <h2 className="text-2xl font-bold text-stone-900">Welcome to Socra!</h2>
        <p className="text-stone-500 mt-2">Let&apos;s personalize your learning experience</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">What should we call you?</label>
        <input
          className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400 text-stone-900 bg-white"
          placeholder="Your name"
          value={name}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">I am a…</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'STUDENT', icon: '🎓', label: 'Student', desc: "I'm here to learn" },
            { value: 'PARENT', icon: '👨‍👩‍👧', label: 'Parent', desc: "I'm setting up for my child" },
          ].map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange('role', r.value)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                role === r.value
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-stone-200 hover:border-orange-300'
              }`}
            >
              <div className="text-2xl mb-1">{r.icon}</div>
              <div className="font-semibold text-stone-900 text-sm">{r.label}</div>
              <div className="text-xs text-stone-500">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
