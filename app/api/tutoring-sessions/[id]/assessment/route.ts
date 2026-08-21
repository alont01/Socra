import { NextResponse } from 'next/server'
import { requireAuth, requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { assessmentStartSchema, parseBody } from '@/lib/validations'
import { generateAssessmentItem } from '@/lib/ai/assessment-generator'
import { initialLevel } from '@/lib/assessment-engine'
import { shapeAssessment } from '@/lib/assessment-shape'
import { route } from '@/lib/api-handler'

async function loadSessionAndRole(id: string, userId: string) {
  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true, student: true },
  })
  if (!session) return { session: null, isTutor: false, isStudent: false }
  return {
    session,
    isTutor: session.tutor.userId === userId,
    isStudent: session.student?.userId === userId,
  }
}

// GET — current assessment state for this session (either party). Shaped
// differently per role: the correct answer is only included for the tutor.
export const GET = route('tutoring-sessions/[id]/assessment', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { session, isTutor, isStudent } = await loadSessionAndRole(id, auth.payload.userId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!isTutor && !isStudent) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const assessment = await prisma.assessment.findUnique({
    where: { tutoringSessionId: id },
    include: { items: { orderBy: { index: 'asc' } } },
  })
  if (!assessment) return NextResponse.json({ assessment: null })

  return NextResponse.json({ assessment: shapeAssessment(assessment, isTutor) })
})

// POST — tutor starts a new adaptive assessment for this session.
export const POST = route(
  'tutoring-sessions/[id]/assessment',
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`assessment-start:${auth.payload.userId}`, { maxRequests: 10, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json().catch(() => ({}))
    const parsed = parseBody(assessmentStartSchema, body)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      include: { tutor: true, student: true },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (!session.student) return NextResponse.json({ error: 'No student in this session' }, { status: 400 })

    const existing = await prisma.assessment.findUnique({ where: { tutoringSessionId: id } })
    if (existing) {
      const full = await prisma.assessment.findUniqueOrThrow({
        where: { tutoringSessionId: id },
        include: { items: { orderBy: { index: 'asc' } } },
      })
      return NextResponse.json({ assessment: shapeAssessment(full, true) })
    }

    const topic = parsed.data.topic?.trim() || session.topic || 'Math'
    const student = session.student

    const masteryData = await prisma.studentProgress.findMany({
      where: { studentId: student.id },
      select: { topic: true, mastery: true },
    })
    const level = initialLevel(masteryData, topic)

    const item = await generateAssessmentItem({
      topic,
      studentGrade: student.gradeLevel,
      studentName: student.name,
      level,
      priorSubTopics: [],
    })

    const created = await prisma.assessment.create({
      data: {
        tutoringSessionId: id,
        studentId: student.id,
        topic,
        currentLevel: level,
        itemCount: 1,
        items: {
          create: [{ index: 1, level, topic: item.topic, question: item.question, hint: item.hint, answer: item.answer }],
        },
      },
      include: { items: { orderBy: { index: 'asc' } } },
    })

    return NextResponse.json({ assessment: shapeAssessment(created, true) }, { status: 201 })
  },
  { errorMessage: 'Could not start the assessment. Please try again.' },
)
