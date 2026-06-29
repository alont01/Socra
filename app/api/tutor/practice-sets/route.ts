import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import { generatePracticeSet } from '@/lib/ai/practice-set-generator'
import { createLogger } from '@/lib/logger'
import { z } from 'zod'
import { parseBody } from '@/lib/validations'
import type { PracticeProblem } from '@/lib/ai/types'

const logger = createLogger('tutor-practice-sets')

function serialize(set: {
  id: string
  title: string
  status: string
  problems: string
  assignedAt: Date | null
  createdAt: Date
  attempts: { id: string }[]
}) {
  return {
    id: set.id,
    title: set.title,
    status: set.status,
    problems: safeJsonParse<PracticeProblem[]>(set.problems, []),
    attemptCount: set.attempts.length,
    assignedAt: set.assignedAt,
    createdAt: set.createdAt,
  }
}

/**
 * GET — list the practice sets (draft + assigned) for a session the tutor owns.
 * Returns full problems including answers so the tutor can review before assigning.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const session = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      include: { tutor: true },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const sets = await prisma.practiceSet.findMany({
      where: { tutoringSessionId: sessionId },
      include: { attempts: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ practiceSets: sets.map(serialize) })
  } catch (err) {
    console.error('[tutor-practice-sets:list]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const generateSchema = z.object({ sessionId: z.string().min(1) })

/**
 * POST — generate a fresh draft homework set from the session's analysis.
 * Lets the tutor regenerate or create one on demand. Saved as a draft.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const parsed = parseBody(generateSchema, body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { sessionId } = parsed.data

    const session = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      include: { tutor: true, student: true, analysis: true },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (!session.student) {
      return NextResponse.json({ error: 'No student assigned to this session' }, { status: 400 })
    }
    if (!session.analysis) {
      return NextResponse.json({ error: 'Session has not been analyzed yet' }, { status: 400 })
    }

    const studentGaps = safeJsonParse<string[]>(session.analysis.studentGaps, [])
    const conceptsCovered = safeJsonParse<string[]>(session.analysis.conceptsCovered, [])

    const problems = await generatePracticeSet({
      studentGaps,
      conceptsCovered,
      studentGrade: session.student.gradeLevel,
      topic: session.topic,
    })

    if (problems.length === 0) {
      return NextResponse.json({ error: 'Could not generate problems for this session' }, { status: 422 })
    }

    const set = await prisma.practiceSet.create({
      data: {
        tutoringSessionId: sessionId,
        studentId: session.student.id,
        title: `${session.topic} Homework`,
        problems: JSON.stringify(problems),
        status: 'draft',
      },
      include: { attempts: { select: { id: true } } },
    })

    logger.info('Generated draft homework', { sessionId, setId: set.id, count: problems.length })
    return NextResponse.json({ practiceSet: serialize(set) })
  } catch (err) {
    console.error('[tutor-practice-sets:generate]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
