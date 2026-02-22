import Anthropic from '@anthropic-ai/sdk'
import type { PracticeProblem, LessonObjective } from './types'

const anthropic = new Anthropic()

interface GenerateProblemsOptions {
  topic: string
  gradeLevel: string
  objectives: LessonObjective[]
  recentMessages: Array<{ role: string; content: string }>
}

export async function generateProblems(opts: GenerateProblemsOptions): Promise<PracticeProblem[]> {
  const { topic, gradeLevel, objectives, recentMessages } = opts

  const completedObjectives = objectives.filter((o) => o.completed).map((o) => o.title)
  const pendingObjectives = objectives.filter((o) => !o.completed).map((o) => o.title)

  const recentContext = recentMessages
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n')

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: `You generate targeted practice problems for math students.
Return ONLY valid JSON — no markdown, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Generate 3 practice problems for this student.

Topic: ${topic}
Grade level: ${gradeLevel}
Completed objectives: ${completedObjectives.join(', ') || 'none'}
Pending objectives: ${pendingObjectives.join(', ') || 'none'}

Recent conversation:
${recentContext}

Return a JSON array of exactly 3 problems. Each problem must have:
- id: a unique string (use format "prob_1", "prob_2", "prob_3")
- question: the problem text (use LaTeX with $ for math)
- hint: a helpful hint that doesn't give away the answer
- difficulty: "easy", "medium", or "hard"
- topic: specific subtopic

Make one easy, one medium, one hard. Target the pending objectives.`,
        },
      ],
    })

    const raw = (response.content[0] as { type: 'text'; text: string }).text.trim()
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1 || end === -1) return []

    const problems: PracticeProblem[] = JSON.parse(raw.slice(start, end + 1))
    // Assign proper UUIDs
    return problems.map((p) => ({ ...p, id: crypto.randomUUID() }))
  } catch (err) {
    console.error('Problem generation failed:', err)
    return []
  }
}
