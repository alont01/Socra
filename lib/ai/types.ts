export interface PracticeProblem {
  id: string
  question: string
  hint: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic: string
}

export interface TranscriptSegment {
  speaker: string
  text: string
  timestamp?: number
}

export interface SessionAnalysisResult {
  summary: string
  conceptsCovered: string[]
  studentStrengths: string[]
  studentGaps: string[]
  tutorFeedback: string
}
