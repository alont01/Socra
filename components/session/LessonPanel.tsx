'use client'

import { useState } from 'react'
import type { LessonObjective } from '@/lib/ai/types'

interface LessonPanelProps {
  topic: string
  studentName?: string
  gradeLevel?: string
  objectives: LessonObjective[]
}

export function LessonPanel({ topic, studentName, gradeLevel, objectives }: LessonPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const completed = objectives.filter((o) => o.completed).length
  const total = objectives.length
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0

  if (collapsed) {
    return (
      <aside className="w-10 bg-white border-r border-orange-100 flex flex-col items-center py-4 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="text-stone-400 hover:text-orange-500 transition-colors text-sm"
          title="Expand panel"
        >
          ▶
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-72 bg-white border-r border-orange-100 flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-orange-50 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-stone-900 text-sm mb-1">Current Topic</h2>
          <p className="text-orange-600 font-medium truncate">{topic || 'Open Exploration'}</p>
          {gradeLevel && <p className="text-xs text-stone-400 mt-0.5">{gradeLevel}</p>}
          {studentName && <p className="text-xs text-stone-400">{studentName}</p>}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-stone-400 hover:text-orange-500 transition-colors text-sm shrink-0 mt-0.5"
          title="Collapse panel"
        >
          ◀
        </button>
      </div>

      {/* Objectives */}
      <div className="p-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
            Lesson Objectives
          </h3>
          {total > 0 && (
            <span className="text-xs text-stone-400">
              {completed}/{total}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mb-4">
            <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-stone-400 mt-1">{progressPct}% complete</p>
          </div>
        )}

        {/* Skeleton loaders */}
        {total === 0 && topic && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex gap-2 items-start">
                <div className="w-4 h-4 rounded bg-orange-100 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-orange-100 rounded w-3/4" />
                  <div className="h-2.5 bg-orange-50 rounded w-full" />
                </div>
              </div>
            ))}
            <p className="text-xs text-stone-400 text-center mt-2">Generating objectives…</p>
          </div>
        )}

        {/* Objective list */}
        {total > 0 && (
          <ul className="space-y-3">
            {objectives.map((obj) => (
              <li key={obj.id} className="flex gap-2 items-start">
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    obj.completed
                      ? 'bg-orange-500 border-orange-500'
                      : 'border-orange-300 bg-white'
                  }`}
                >
                  {obj.completed && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path
                        d="M1.5 5l2.5 2.5 4.5-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium leading-tight ${
                      obj.completed ? 'text-stone-400 line-through' : 'text-stone-700'
                    }`}
                  >
                    {obj.title}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5 leading-snug">{obj.description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Study tip footer */}
      <div className="p-4 border-t border-orange-50">
        <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
          <p className="text-xs font-semibold text-orange-700 mb-1">Study Tip</p>
          <p className="text-xs text-stone-600">
            Try explaining concepts in your own words — teaching is the best way to learn!
          </p>
        </div>
      </div>
    </aside>
  )
}
