import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createAnswerToken } from '@/lib/answer-token'
import { z } from 'zod'
import { parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

const signAnswersSchema = z.object({
  problems: z.array(z.object({
    id: z.string().min(1),
    answer: z.string().min(1),
    topic: z.string().min(1),
  })).min(1).max(10),
})

export const POST = route('tutoring-sessions/[id]/live-practice/sign-answers', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const parsed = parseBody(signAnswersSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  // Verify tutor owns this session
  const session = await prisma.tutoringSession.findUnique({
    where: { id },
    include: { tutor: true },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.tutor.userId !== auth.payload.userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Generate fresh tokens for each problem
  const tokens: Record<string, string> = {}
  for (const p of parsed.data.problems) {
    tokens[p.id] = createAnswerToken({ answer: p.answer, topic: p.topic }, id, p.id)
  }

  return NextResponse.json({ tokens })
})
