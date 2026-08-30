import { z } from 'zod'

// ── Auth ──

// The identifier is an email OR a username (parent-created student accounts log
// in with a username). Kept under the `email` key for client compatibility.
export const loginSchema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
})

// A weekly availability block: day 0–6, "HH:MM" start/end.
export const availabilityBlockSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time'),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time'),
})
export const availabilitySchema = z.array(availabilityBlockSchema).max(60)

// Parent creates a child's student account. No student email required — the
// parent sets a username + password the child uses to log in. Availability +
// desired hours feed the tutor-matching engine.
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
  desiredHoursPerWeek: z.number().int().min(1).max(20).optional(),
  availability: availabilitySchema.optional(),
})

// Parent resets their child's sign-in password. Child accounts have a
// synthetic, non-deliverable email, so the normal forgot-password flow can
// never reach them — the parent is the only recovery path there is.
// `password` is optional: omitting it asks the server to generate one.
export const resetChildPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters').max(128).optional(),
})

// Tutor sets up matching: weekly capacity + availability + accepting toggle.
export const matchingSetupSchema = z.object({
  maxHoursPerWeek: z.number().int().min(0).max(80).nullable().optional(),
  availability: availabilitySchema.optional(),
  acceptingStudents: z.boolean().optional(),
})

export const offerRespondSchema = z.object({
  action: z.enum(['accept', 'decline']),
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

export const onboardingCompleteSchema = z.object({
  name: z.string().min(1),
  gradeLevel: z.string().min(1),
})

// ── Chat ──

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
})

export const chatSchema = z.object({
  // Capped so a client can't grow the request (and the model's context/cost)
  // without bound by replaying an ever-longer history.
  messages: z.array(chatMessageSchema).min(1, 'At least one message is required').max(100),
  // The problem the student is looking at while they ask, so the assistant can
  // help with THIS question instead of guessing from "I'm stuck". Question text
  // only — the answer key never leaves the server.
  problemContext: z.string().trim().max(2000).optional(),
})

// ── Sessions ──

export const createSessionSchema = z.object({
  // Optional: the tutor dashboard offers an "open" session with no student
  // attached (used for a first call before a match is confirmed). The route
  // still verifies roster membership whenever an id IS supplied.
  studentId: z.string().min(1).optional(),
  topic: z.string().min(1, 'Topic is required'),
  scheduledAt: z.string().optional(),
  // Intended length. Caps what the session can bill (lib/billing.ts), so the
  // ceiling is deliberately generous but finite — Daily's room expires at 3h.
  scheduledMinutes: z.number().int().min(15).max(240).optional(),
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
  // No real answer needs anywhere near this much text; capped so a crafted
  // answer can't reach the math evaluator's parser with a pathological input.
  studentAnswer: z.string().min(1, 'Answer is required').max(500),
})

// ── Live Practice ──

export const livePracticeSchema = z.object({
  mode: z.enum(['practice', 'assessment']),
  tutorNotes: z.string().default(''),
})

export const livePracticeAnswerSchema = z.object({
  problemId: z.string().min(1),
  answer: z.string().min(1).max(500),
  answerToken: z.string().min(1),
})

// ── Adaptive assessment ──

export const assessmentStartSchema = z.object({
  topic: z.string().trim().max(120).optional(),
})

export const assessmentAnswerSchema = z.object({
  itemId: z.string().min(1),
  answer: z.string().min(1).max(500),
})

export const assessmentOverrideSchema = z.object({
  itemId: z.string().min(1),
  tutorResult: z.enum(['correct', 'incorrect', 'worked_together']),
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

// ── Admin billing ──

/**
 * "YYYY-MM" naming a billing period, with a real calendar month (01–12).
 *
 * A plain `\d{4}-\d{2}` shape accepted "2026-13" and "2026-00" — syntactically
 * fine, but `new Date('2026-13-01T00:00:00Z')` is an Invalid Date (JS does not
 * clamp out-of-range ISO fields), which propagates into `monthBounds` as NaN
 * bounds and fails deep inside the Prisma query with an opaque 500, instead of
 * the 400 the validation at this boundary exists to give.
 */
export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM')

// ── Utility for parsing and returning errors ──

export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.issues[0]
    return { error: `${firstError.path.join('.')}: ${firstError.message}`.replace(/^: /, '') }
  }
  return { data: result.data }
}
