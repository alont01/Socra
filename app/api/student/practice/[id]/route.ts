import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireStudent()
    if (!auth.ok) return auth.response

    const set = await prisma.practiceSet.findUnique({
      where: { id },
      include: { attempts: true },
    })

    if (!set || set.studentId !== auth.student.id) {
      return NextResponse.json({ error: 'Practice set not found' }, { status: 404 })
    }

    // Strip answer field from problems so clients can't cheat
    const problems = safeJsonParse<Record<string, unknown>[]>(set.problems, [])
    const safeProblems = problems.map(({ answer, ...rest }: { answer?: string; [key: string]: unknown }) => rest)

    return NextResponse.json({
      practiceSet: {
        id: set.id,
        title: set.title,
        problems: safeProblems,
        attempts: set.attempts,
        createdAt: set.createdAt,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
