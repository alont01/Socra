// ── Shared frontend types ──
// These are used across multiple page/component files.

export interface AssessmentItemData {
  id: string
  index: number
  level: number
  topic: string
  question: string
  hint: string
  answer?: string // present only in the tutor's view
  studentAnswer: string | null
  autoCorrect: boolean | null
  tutorResult: 'correct' | 'incorrect' | 'worked_together' | null
  outcome: 'correct' | 'incorrect' | 'worked_together' | null
  answered: boolean
}

export interface AssessmentData {
  id: string
  topic: string
  status: 'in_progress' | 'completed'
  currentLevel: number
  itemCount: number
  maxItems: number
  items: AssessmentItemData[]
  currentItem: AssessmentItemData | null
  result: {
    estimatedLevel: number | null
    summary: string
    strengths: string[]
    gaps: string[]
  } | null
}

export interface TutoringSessionData {
  id: string
  topic: string
  status: string
  startedAt: string | null
  endedAt: string | null
  dailyRoomUrl: string | null
  dailyRoomName: string | null
  tutorNotes: string
  capturedNotes: string
  whiteboardImage: string
  tutor: { id: string; name: string; userId: string }
  student: { id: string; name: string; gradeLevel: string; userId: string } | null
}

export interface AnalysisData {
  summary: string
  conceptsCovered: string[]
  studentStrengths: string[]
  studentGaps: string[]
  tutorFeedback: string
}

export interface TranscriptData {
  content: string
  speakers: string[]
  durationSeconds: number | null
}

export interface PracticeSetData {
  id: string
  title: string
  problems: PracticeProblemData[]
  createdAt: string
  tutoringSessionId: string | null
  _count?: { attempts: number }
}

export interface PracticeProblemData {
  id: string
  question: string
  hint: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic: string
  answer?: string
}

export interface StudentProgressData {
  topic: string
  mastery: number
  updatedAt: string
}
