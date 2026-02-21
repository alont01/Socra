const GRADES = [
  'Middle School (6-8)',
  'High School (9-10)',
  'High School (11-12)',
  'College',
  'Adult Learner',
]

const TOPICS = [
  'Arithmetic', 'Pre-Algebra', 'Algebra I', 'Algebra II',
  'Geometry', 'Trigonometry', 'Pre-Calculus', 'Calculus',
  'Statistics', 'Linear Algebra', 'Number Theory', 'Discrete Math',
]

interface Step2Props {
  gradeLevel: string
  mathTopics: string[]
  onChange: (field: string, value: string | string[]) => void
}

export function Step2({ gradeLevel, mathTopics, onChange }: Step2Props) {
  const toggleTopic = (topic: string) => {
    const updated = mathTopics.includes(topic)
      ? mathTopics.filter((t) => t !== topic)
      : [...mathTopics, topic]
    onChange('mathTopics', updated)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">📚</div>
        <h2 className="text-2xl font-bold text-stone-900">Your math level</h2>
        <p className="text-stone-500 mt-2">Help us calibrate the right difficulty</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Grade Level</label>
        <div className="flex flex-wrap gap-2">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange('gradeLevel', g)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                gradeLevel === g
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'border-stone-200 text-stone-600 hover:border-orange-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">
          Math topics you want to work on <span className="text-stone-400">(pick all that apply)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTopic(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                mathTopics.includes(t)
                  ? 'bg-orange-100 text-orange-700 border-orange-400'
                  : 'border-stone-200 text-stone-600 hover:border-orange-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
