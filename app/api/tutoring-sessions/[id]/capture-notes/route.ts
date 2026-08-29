import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { extractHandwrittenNotes } from '@/lib/ai/note-extractor'
import { route } from '@/lib/api-handler'
import { imageBase64Schema, parseBody } from '@/lib/validations'
import { config } from '@/lib/config'

export const POST = route('tutoring-sessions/[id]/capture-notes', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
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

  // Runs on the server, where the host clock is UTC (Render) — without an
  // explicit zone this stamps a 3pm capture as 7pm. See lib/config.ts.
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: config.timeZone,
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
})
