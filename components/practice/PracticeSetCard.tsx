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
  const isComplete = completedCount >= problemCount

  return (
    <Link href={`/student/practice/${id}`}>
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 hover:border-orange-300 transition-colors">
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
