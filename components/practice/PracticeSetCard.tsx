'use client'

import Link from 'next/link'

interface PracticeSetCardProps {
  id: string
  title: string
  topic: string
  problemCount: number
  completedCount: number
  createdAt: string
}

export function PracticeSetCard({ id, title, topic, problemCount, completedCount, createdAt }: PracticeSetCardProps) {
  const pct = problemCount > 0 ? Math.round((completedCount / problemCount) * 100) : 0
  // A set with no problems isn't "Done" — 0 >= 0 marked an empty set complete,
  // which is the one case where the badge is actively misleading.
  const isComplete = problemCount > 0 && completedCount >= problemCount

  return (
    <Link href={`/student/practice/${id}`}>
      <div className="bg-white rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-5 hover:ring-orange-200/70 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-stone-900 text-sm">{title || 'Practice Set'}</h3>
          {isComplete ? (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Done</span>
          ) : (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{pct}%</span>
          )}
        </div>
        {topic && <p className="text-xs text-stone-400 mb-3">{topic}</p>}

        {/* Progress bar */}
        <div className="w-full bg-stone-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-orange-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-stone-400 mt-2">
          {completedCount}/{problemCount} problems · {new Date(createdAt).toLocaleDateString()}
        </p>
      </div>
    </Link>
  )
}
