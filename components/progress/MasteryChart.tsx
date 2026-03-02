'use client'

interface ProgressItem {
  topic: string
  mastery: number
  updatedAt: string
}

interface MasteryChartProps {
  progress: ProgressItem[]
}

function masteryLabel(mastery: number) {
  if (mastery >= 0.8) return { text: 'Mastered', color: 'text-green-700 bg-green-100' }
  if (mastery >= 0.5) return { text: 'Progressing', color: 'text-amber-700 bg-amber-100' }
  if (mastery >= 0.2) return { text: 'Learning', color: 'text-orange-700 bg-orange-100' }
  return { text: 'Starting', color: 'text-stone-600 bg-stone-100' }
}

export function MasteryChart({ progress }: MasteryChartProps) {
  if (progress.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-8 text-center">
        <p className="text-stone-500">No progress data yet. Complete practice sets to track your mastery!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {progress.map((p) => {
        const label = masteryLabel(p.mastery)
        const pct = Math.round(p.mastery * 100)
        return (
          <div key={p.topic} className="bg-white rounded-2xl border border-orange-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-stone-900 text-sm">{p.topic}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${label.color}`}>
                {label.text}
              </span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-orange-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-stone-400 mt-1">{pct}% mastery</p>
          </div>
        )
      })}
    </div>
  )
}
