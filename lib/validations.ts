import { z } from 'zod'

// ── Auth ──

// The identifier is an email OR a username (parent-created student accounts log
// in with a username). Kept under the `email` key for client compatibility.
export const loginSchema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
})

// Parent creates a child's student account. No student email required — the
// parent sets a username + password the child uses to log in.
export const addChildSchema = z.object({
  name: z.string().trim().min(1, 'Child name is required').max(80),
  gradeLevel: z.string().trim().max(40).optional().or(z.literal('')),
  goals: z.string().trim().max(500).optional().or(z.literal('')),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9._-]{2,23}$/,
      'Username must be 3–24 characters, start with a letter, and use only letters, numbers, . _ -',
    ),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
})

// Public signup is limited to STUDENT and PARENT. Tutor accounts are created
// only by redeeming an admin-issued tutor invite (see /api/tutor-invites).
export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['STUDENT', 'PARENT']),
  name: z.string().min(1, 'Name is required'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const setRoleSchema = z.object({
  role: z.enum(['STUDENT', 'PARENT']),
  name: z.string().min(1, 'Name is required'),
})

export const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
})

// ── Onboarding ──

export const onboardingSchema = z.object({
  name: z.string().min(1),
  gradeLevel: z.string().min(1),
  mathTopics: z.array(z.string()).default([]),
  strengthAreas: z.array(z.string()).default([]),
  weaknessAreas: z.array(z.string()).default([]),
  learningStyle: z.string().default(''),
  goals: z.string().default(''),
})

export const onboardingCompleteSchema = z.object({
  name: z.string().min(1),
  gradeLevel: z.string().min(1),
})

// ── Chat ──

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
})

export const chatSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message is required'),
})

// ── Sessions ──

export const createSessionSchema = z.object({
  studentId: z.string().min(1),
  topic: z.string().min(1, 'Topic is required'),
  scheduledAt: z.string().optional(),
})

export const updateSessionSchema = z.object({
  tutorNotes: z.string().max(20_000).optional(),
  topic: z.string().max(200).optional(),
  status: z.enum(['scheduled', 'active', 'completed', 'cancelled']).optional(),
})

// ── Daily.co ──

export const dailyTokenSchema = z.object({
  sessionId: z.string().min(1),
})

// ── Practice ──

export const practiceAttemptSchema = z.object({
  problemIndex: z.number().int().min(0),
  studentAnswer: z.string().min(1, 'Answer is required'),
})

// ── Live Practice ──

export const livePracticeSchema = z.object({
  mode: z.enum(['practice', 'assessment']),
  tutorNotes: z.string().default(''),
})

export const livePracticeAnswerSchema = z.object({
  problemId: z.string().min(1),
  answer: z.string().min(1),
  answerToken: z.string().min(1),
})

// ── Whiteboard / Notes ──

export const imageBase64Schema = z.object({
  imageBase64: z.string().min(1),
})

// ── Public consultation lead (parent-facing /get-started page) ──

export const consultationSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  studentGrade: z.string().trim().max(60).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  source: z.string().trim().max(60).optional().or(z.literal('')),
})

// ── Utility for parsing and returning errors ──

export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.issues[0]
    return { error: `${firstError.path.join('.')}: ${firstError.message}`.replace(/^: /, '') }
  }
  return { data: result.data }
}
