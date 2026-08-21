import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { route } from '@/lib/api-handler'
import { imageBase64Schema, parseBody } from '@/lib/validations'

export const POST = route('tutoring-sessions/[id]/whiteboard', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const rl = rateLimit(`whiteboard:${auth.payload.userId}`, { maxRequests: 30, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Only the tutor can save whiteboard' }, { status: 403 })
  }
  // Allow saving for active or completed sessions (whiteboard snapshot is captured
  // right before ending, so a race with the end endpoint shouldn't block the save)
  if (session.status !== 'active' && session.status !== 'completed') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
  }

  const body = await request.json()
  const parsed = parseBody(imageBase64Schema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { imageBase64 } = parsed.data

  const MAX_BASE64_LENGTH = 5 * 1024 * 1024 // ~3.75MB decoded
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: 'Image too large' }, { status: 400 })
  }

  await prisma.tutoringSession.update({
    where: { id },
    data: { whiteboardImage: imageBase64 },
  })

  return NextResponse.json({ success: true })
})
