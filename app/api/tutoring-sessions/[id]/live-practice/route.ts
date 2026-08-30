import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { generateLiveProblems } from '@/lib/ai/live-problem-generator'
import { createAnswerToken } from '@/lib/answer-token'
import { livePracticeSchema, parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

// GET — the student's current mastery snapshot for this session, so the
// tutor's panel can show real data on open rather than only after a "Generate
// Practice" call (whose response was previously the only source for it).
export const GET = route('tutoring-sessions/[id]/live-practice', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true, student: { include: { studentProgress: true } } },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  if (!session.student) return NextResponse.json({ studentMastery: [] })

  const studentMastery = session.student.studentProgress.map((p) => ({ topic: p.topic, mastery: p.mastery }))
  return NextResponse.json({ studentMastery })
})

export const POST = route('tutoring-sessions/[id]/live-practice', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const rl = rateLimit(`live-practice:${auth.payload.userId}`, { maxRequests: 10, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const body = await request.json()
  const parsed = parseBody(livePracticeSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { mode, tutorNotes } = parsed.data

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: {
      tutor: true,
      student: {
        include: {
          studentProgress: true,
        },
      },
    },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  if (session.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
  }
  if (!session.student) {
    return NextResponse.json({ error: 'No student assigned to this session' }, { status: 400 })
  }

  const student = session.student
  const masteryData = student.studentProgress.map((p) => ({
    topic: p.topic,
    mastery: p.mastery,
  }))

  const problems = await generateLiveProblems({
    topic: session.topic,
    tutorNotes: tutorNotes || session.tutorNotes,
    studentGrade: student.gradeLevel,
    studentName: student.name,
    masteryData,
    mode,
  })

  // Attach encrypted answer tokens to each problem
  // The student receives the token but cannot extract the answer from it
  const problemsWithTokens = problems.map((p) => ({
    ...p,
    answerToken: createAnswerToken(
      { answer: p.answer || '', topic: p.topic },
      id,
      p.id,
    ),
  }))

  return NextResponse.json({
    problems: problemsWithTokens,
    studentMastery: masteryData,
  })
})
