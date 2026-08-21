import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { safeJsonParse } from '@/lib/json'
import { z } from 'zod'
import { parseBody } from '@/lib/validations'
import type { PracticeProblem } from '@/lib/ai/types'
import { route } from '@/lib/api-handler'

type SetWithSession = NonNullable<Awaited<ReturnType<typeof loadSet>>>

function loadSet(id: string) {
  return prisma.practiceSet.findUnique({
    where: { id },
    include: {
      attempts: { select: { id: true } },
      tutoringSession: { include: { tutor: true } },
    },
  })
}

function serialize(set: SetWithSession) {
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
 * Load a set and verify the requesting tutor owns the session it belongs to.
 * Returns the set or a NextResponse error to return directly.
 */
async function requireOwnedSet(id: string, userId: string): Promise<SetWithSession | NextResponse> {
  const set = await loadSet(id)
  if (!set) return NextResponse.json({ error: 'Practice set not found' }, { status: 404 })
  if (!set.tutoringSession || set.tutoringSession.tutor.userId !== userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  return set
}

export const GET = route('tutor/practice-sets/[id]', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const result = await requireOwnedSet(id, auth.payload.userId)
  if (result instanceof NextResponse) return result

  return NextResponse.json({ practiceSet: serialize(result) })
})

const problemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1, 'Question is required'),
  hint: z.string().default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  topic: z.string().default(''),
  answer: z.string().default(''),
})

const updateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    problems: z.array(problemSchema).min(1).max(20).optional(),
    status: z.enum(['draft', 'assigned']).optional(),
  })
  .refine((d) => d.title !== undefined || d.problems !== undefined || d.status !== undefined, {
    message: 'No changes provided',
  })

/**
 * PATCH — edit a set's title/problems and/or assign it as homework.
 * Setting status to "assigned" stamps assignedAt and makes it visible to the student.
 */
export const PATCH = route('tutor/practice-sets/[id]', async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const result = await requireOwnedSet(id, auth.payload.userId)
  if (result instanceof NextResponse) return result

  const body = await request.json()
  const parsed = parseBody(updateSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { title, problems, status } = parsed.data

  const data: {
    title?: string
    problems?: string
    status?: string
    assignedAt?: Date | null
  } = {}
  if (title !== undefined) data.title = title
  if (problems !== undefined) {
    // Persist answers but never any client-supplied answer tokens.
    data.problems = JSON.stringify(
      problems.map((p) => ({
        id: p.id,
        question: p.question,
        hint: p.hint,
        difficulty: p.difficulty,
        topic: p.topic,
        answer: p.answer,
      })),
    )
  }
  if (status !== undefined) {
    data.status = status
    // Stamp assignedAt on first assignment; clear it if reverted to draft.
    data.assignedAt = status === 'assigned' ? result.assignedAt ?? new Date() : null
  }

  const updated = await loadSetAfterUpdate(id, data)
  return NextResponse.json({ practiceSet: serialize(updated) })
})

async function loadSetAfterUpdate(
  id: string,
  data: { title?: string; problems?: string; status?: string; assignedAt?: Date | null },
): Promise<SetWithSession> {
  await prisma.practiceSet.update({ where: { id }, data })
  const reloaded = await loadSet(id)
  return reloaded as SetWithSession
}

/**
 * DELETE — discard a draft. Assigned homework cannot be deleted here (it may
 * already have student attempts); revert it to draft first if needed.
 */
export const DELETE = route('tutor/practice-sets/[id]', async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const result = await requireOwnedSet(id, auth.payload.userId)
  if (result instanceof NextResponse) return result

  if (result.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft sets can be deleted' }, { status: 400 })
  }

  await prisma.practiceSet.delete({ where: { id } })
  return NextResponse.json({ success: true })
})
