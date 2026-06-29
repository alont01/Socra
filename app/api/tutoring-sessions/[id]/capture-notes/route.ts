import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { extractHandwrittenNotes } from '@/lib/ai/note-extractor'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    // Each call runs a vision AI request — rate-limit to bound cost/abuse.
    const rl = rateLimit(`capture-notes:${auth.payload.userId}`, { maxRequests: 15, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      include: { student: true },
    })

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
    }
    if (!session.student || session.student.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Only the student can capture notes' }, { status: 403 })
    }

    const body = await request.json()
    const { imageBase64Schema, parseBody } = await import('@/lib/validations')
    const parsed = parseBody(imageBase64Schema, body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { imageBase64 } = parsed.data

    const MAX_BASE64_LENGTH = 5 * 1024 * 1024 // ~3.75MB decoded
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'Image too large' }, { status: 400 })
    }

    const extractedText = await extractHandwrittenNotes(imageBase64)

    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    const separator = `\n\n--- Captured notes (${timestamp}) ---\n`
    const updatedNotes = session.capturedNotes
      ? session.capturedNotes + separator + extractedText
      : `--- Captured notes (${timestamp}) ---\n` + extractedText

    await prisma.tutoringSession.update({
      where: { id },
      data: { capturedNotes: updatedNotes },
    })

    return NextResponse.json({ success: true, extractedText })
  } catch (err) {
    console.error('[capture-notes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
