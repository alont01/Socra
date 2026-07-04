'use client'

interface AnalysisSummaryProps {
  summary: string
  conceptsCovered: string[]
  studentStrengths: string[]
  studentGaps: string[]
}

export function AnalysisSummary({ summary, conceptsCovered, studentStrengths, studentGaps }: AnalysisSummaryProps) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5">
        <h3 className="font-semibold text-stone-900 mb-2">Session Summary</h3>
        <p className="text-sm text-stone-600 leading-relaxed">{summary}</p>
      </div>

      {/* Concepts Covered */}
      {conceptsCovered.length > 0 && (
        <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5">
          <h3 className="font-semibold text-stone-900 mb-3">Concepts Covered</h3>
          <div className="flex flex-wrap gap-2">
            {conceptsCovered.map((c, i) => (
              <span key={`${c}-${i}`} className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Strengths & Gaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {studentStrengths.length > 0 && (
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
            <h3 className="font-semibold text-green-700 mb-3">Strengths</h3>
            <ul className="space-y-1.5">
              {studentStrengths.map((s, i) => (
                <li key={`${s}-${i}`} className="text-sm text-stone-600 flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {studentGaps.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
            <h3 className="font-semibold text-amber-700 mb-3">Areas to Work On</h3>
            <ul className="space-y-1.5">
              {studentGaps.map((g, i) => (
                <li key={`${g}-${i}`} className="text-sm text-stone-600 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">-</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
