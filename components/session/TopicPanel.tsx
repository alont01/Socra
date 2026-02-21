'use client'

import { Badge } from '@/components/ui/Badge'

interface TopicPanelProps {
  topic: string
  studentName?: string
  gradeLevel?: string
  mathTopics?: string[]
}

const MATH_CONCEPTS: Record<string, string[]> = {
  'Algebra I': ['Variables & Expressions', 'Linear Equations', 'Inequalities', 'Polynomials', 'Factoring'],
  'Algebra II': ['Quadratic Equations', 'Functions', 'Exponentials', 'Logarithms', 'Complex Numbers'],
  'Geometry': ['Triangles', 'Circles', 'Area & Volume', 'Proofs', 'Coordinate Geometry'],
  'Calculus': ['Limits', 'Derivatives', 'Integration', 'Chain Rule', 'Optimization'],
  'Trigonometry': ['Unit Circle', 'Trig Identities', 'Laws of Sines/Cosines', 'Inverse Trig'],
  'Statistics': ['Mean/Median/Mode', 'Standard Deviation', 'Probability', 'Distributions', 'Hypothesis Testing'],
}

const SOCRATIC_TIPS = [
  'Try breaking the problem into smaller steps.',
  'What do you already know about this topic?',
  'Draw a diagram or write out what you know.',
  'Check your work by plugging the answer back in.',
  'Estimate the answer first — does your result make sense?',
]

export function TopicPanel({ topic, studentName, gradeLevel, mathTopics = [] }: TopicPanelProps) {
  const concepts = MATH_CONCEPTS[topic] || []
  const tip = SOCRATIC_TIPS[Math.floor(Math.random() * SOCRATIC_TIPS.length)]

  return (
    <aside className="w-72 bg-white border-r border-orange-100 flex flex-col overflow-y-auto shrink-0">
      <div className="p-4 border-b border-orange-50">
        <h2 className="font-semibold text-stone-900 text-sm mb-1">Current Topic</h2>
        <p className="text-orange-600 font-medium">{topic || 'Open Exploration'}</p>
        {gradeLevel && (
          <p className="text-xs text-stone-400 mt-0.5">{gradeLevel}</p>
        )}
      </div>

      {concepts.length > 0 && (
        <div className="p-4 border-b border-orange-50">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
            Key Concepts
          </h3>
          <ul className="space-y-1">
            {concepts.map((c) => (
              <li key={c} className="text-sm text-stone-600 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mathTopics.length > 1 && (
        <div className="p-4 border-b border-orange-50">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
            Related Topics
          </h3>
          <div className="flex flex-wrap gap-1">
            {mathTopics
              .filter((t) => t !== topic)
              .slice(0, 5)
              .map((t) => (
                <Badge key={t} variant="stone" className="cursor-default">{t}</Badge>
              ))}
          </div>
        </div>
      )}

      <div className="p-4 mt-auto">
        <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
          <p className="text-xs font-semibold text-orange-700 mb-1">💡 Study Tip</p>
          <p className="text-xs text-stone-600">{tip}</p>
        </div>
      </div>
    </aside>
  )
}
