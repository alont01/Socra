import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
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
      return NextResponse.json({ error: 'Only the tutor can save whiteboard' }, { status: 403 })
    }
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
    }

    const body = await request.json()
    const { imageBase64 } = body as { imageBase64: string }
    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
    }

    const MAX_BASE64_LENGTH = 5 * 1024 * 1024 // ~3.75MB decoded
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'Image too large' }, { status: 400 })
    }

    await prisma.tutoringSession.update({
      where: { id },
      data: { whiteboardImage: imageBase64 },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[whiteboard]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
