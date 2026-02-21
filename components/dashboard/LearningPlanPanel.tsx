'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'

interface Week {
  week: number
  theme: string
  topics: string[]
  goals: string[]
  dailySessions: number
}

interface LearningPlan {
  overview: string
  weeks: Week[]
  focusAreas: string[]
  encouragement: string
}

interface LearningPlanPanelProps {
  planJson: string
}

export function LearningPlanPanel({ planJson }: LearningPlanPanelProps) {
  const [openWeek, setOpenWeek] = useState<number>(1)

  let plan: LearningPlan | null = null
  try {
    plan = JSON.parse(planJson)
  } catch {
    return (
      <div className="bg-white rounded-2xl border border-orange-100 p-6">
        <p className="text-stone-400 text-sm">No learning plan yet. Complete onboarding to generate yours!</p>
      </div>
    )
  }

  if (!plan) return null

  return (
    <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
      <h2 className="font-bold text-stone-900 mb-1">Your Learning Plan</h2>
      <p className="text-xs text-stone-500 mb-4">{plan.overview}</p>

      <div className="space-y-2">
        {plan.weeks.map((week) => (
          <div key={week.week} className="border border-stone-100 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenWeek(openWeek === week.week ? 0 : week.week)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-stone-50 transition-colors"
            >
              <span
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  week.week === 1
                    ? 'bg-orange-500 text-white'
                    : 'bg-stone-100 text-stone-500'
                }`}
              >
                {week.week}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-stone-900 text-sm">{week.theme}</p>
              </div>
              <span className="text-stone-400 text-xs">{openWeek === week.week ? '▲' : '▼'}</span>
            </button>

            {openWeek === week.week && (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {week.topics.map((t) => (
                    <Badge key={t} variant="orange">{t}</Badge>
                  ))}
                </div>
                <ul className="space-y-1">
                  {week.goals.map((g, i) => (
                    <li key={i} className="text-xs text-stone-600 flex gap-1.5">
                      <span className="text-orange-400 shrink-0">→</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {plan.focusAreas.length > 0 && (
        <div className="mt-4 pt-4 border-t border-stone-100">
          <p className="text-xs font-medium text-stone-600 mb-2">Focus Areas</p>
          <div className="flex flex-wrap gap-1">
            {plan.focusAreas.map((a) => (
              <Badge key={a} variant="amber">{a}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
