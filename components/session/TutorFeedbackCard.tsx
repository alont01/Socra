'use client'

interface TutorFeedbackCardProps {
  feedback: string
}

export function TutorFeedbackCard({ feedback }: TutorFeedbackCardProps) {
  if (!feedback) return null

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
      <h3 className="font-semibold text-blue-700 mb-2">Coaching Tips</h3>
      <p className="text-sm text-stone-600 leading-relaxed">{feedback}</p>
    </div>
  )
}
