interface StepIndicatorProps {
  current: number
  total: number
  labels: string[]
}

export function StepIndicator({ current, total, labels }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < current
                ? 'bg-orange-500 text-white'
                : i === current
                ? 'bg-orange-500 text-white ring-4 ring-orange-200'
                : 'bg-stone-200 text-stone-500'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 ${i < current ? 'bg-orange-500' : 'bg-stone-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}
