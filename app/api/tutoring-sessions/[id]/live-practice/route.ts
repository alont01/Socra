import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { generateLiveProblems } from '@/lib/ai/live-problem-generator'
import { storeProblems } from '@/lib/live-practice-store'
import { livePracticeSchema, parseBody } from '@/lib/validations'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // Store answers server-side so student client never sees them
    storeProblems(id, problems.map((p) => ({
      id: p.id,
      answer: p.answer || '',
      topic: p.topic,
    })))

    return NextResponse.json({
      problems,
      studentMastery: masteryData,
    })
  } catch (err) {
    console.error('[live-practice]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
