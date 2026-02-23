export type MessageIntent = 'explain' | 'practice' | 'solve-hard' | 'visual' | 'general'

export type SSEEvent =
  | { type: 'text'; text: string }
  | { type: 'visual'; svg: string }
  | { type: 'objective_complete'; objectiveId: string }
  | { type: 'practice_problem'; problem: PracticeProblem }
  | { type: 'choices'; choices: string[] }

export interface PracticeProblem {
  id: string
  question: string
  hint: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic: string
}

export interface LessonObjective {
  id: string
  title: string
  description: string
  order: number
  completed: boolean
  completedAt?: string | null
}

export interface OrchestratorContext {
  sessionId: string
  topic: string
  student: {
    name: string
    gradeLevel: string
    mathTopics: string
    strengthAreas: string
    weaknessAreas: string
    learningStyle: string
    goals: string
  } | null
  objectives: LessonObjective[]
  messageHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  imageBase64?: string
  imageMimeType?: string
}
