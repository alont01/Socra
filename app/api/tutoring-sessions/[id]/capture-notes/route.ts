import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { extractHandwrittenNotes } from '@/lib/ai/note-extractor'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

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
    const { imageBase64 } = body as { imageBase64: string }
    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
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
