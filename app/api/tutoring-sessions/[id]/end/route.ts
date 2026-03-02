import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processSessionPostCompletion } from '@/lib/session-processing'

export async function POST(
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

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      include: { tutor: true },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== payload.userId) {
      return NextResponse.json({ error: 'Only tutor can end session' }, { status: 403 })
    }

    const updated = await prisma.tutoringSession.update({
      where: { id },
      data: {
        status: 'completed',
        endedAt: new Date(),
      },
    })

    // Fire-and-forget post-session processing
    processSessionPostCompletion(id).catch(console.error)

    return NextResponse.json({ session: updated })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
