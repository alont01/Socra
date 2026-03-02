import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const student = await prisma.studentProfile.findUnique({ where: { userId: payload.userId } })
    if (!student) return NextResponse.json({ error: 'Not a student' }, { status: 403 })

    const set = await prisma.practiceSet.findUnique({
      where: { id },
      include: { attempts: true },
    })

    if (!set || set.studentId !== student.id) {
      return NextResponse.json({ error: 'Practice set not found' }, { status: 404 })
    }

    return NextResponse.json({
      practiceSet: {
        id: set.id,
        title: set.title,
        problems: JSON.parse(set.problems),
        attempts: set.attempts,
        createdAt: set.createdAt,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
