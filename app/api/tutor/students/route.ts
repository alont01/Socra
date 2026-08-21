import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { route } from '@/lib/api-handler'

export const GET = route('tutor/students', async () => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const roster = await prisma.tutorStudent.findMany({
    where: { tutorId: auth.tutor.id },
    include: {
      student: {
        include: {
          user: { select: { email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const students = roster.map((r) => ({
    id: r.student.id,
    name: r.student.name,
    email: r.student.user.email,
    gradeLevel: r.student.gradeLevel,
    mathTopics: r.student.mathTopics,
    addedAt: r.createdAt,
  }))

  return NextResponse.json({ students })
})

export const POST = route('tutor/students', async (request: Request) => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const rl = rateLimit(`add-student:${auth.payload.userId}`, { maxRequests: 10, windowMs: 60_000 })
  if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

  const { email: rawEmail } = await request.json()
  if (!rawEmail || typeof rawEmail !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }
  const email = rawEmail.toLowerCase().trim()

  const studentUser = await prisma.user.findUnique({
    where: { email },
    include: { studentProfile: true },
  })

  if (!studentUser) {
    return NextResponse.json(
      { error: 'No Socra account uses that email yet. Ask them to sign up as a student first.' },
      { status: 404 },
    )
  }
  if (!studentUser.studentProfile) {
    // The user row exists but has no student profile. Two cases:
    //  - role STUDENT but profile not yet created → onboarding unfinished
    //    (common right after an OAuth sign-in), or
    //  - a different role entirely (tutor/parent).
    const msg = studentUser.role === 'STUDENT'
      ? 'That person signed in but hasn\'t finished setting up their student profile yet. Ask them to log in and complete onboarding.'
      : `That account is a ${studentUser.role.toLowerCase()}, not a student. They can switch to Student in Settings.`
    return NextResponse.json({ error: msg }, { status: 404 })
  }

  const existing = await prisma.tutorStudent.findUnique({
    where: { tutorId_studentId: { tutorId: auth.tutor.id, studentId: studentUser.studentProfile.id } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Student already in your roster' }, { status: 409 })
  }

  // A student can have at most one ACTIVE tutor (DB-enforced). Check for one
  // under a *different* tutor up front so we can give a clear message,
  // rather than letting the unique-constraint violation fall through.
  const activeElsewhere = await prisma.tutorStudent.findFirst({
    where: { studentId: studentUser.studentProfile.id, status: 'active' },
  })
  if (activeElsewhere) {
    return NextResponse.json(
      { error: 'This student already has an active tutor and can\'t be assigned to another one.' },
      { status: 409 },
    )
  }

  try {
    await prisma.tutorStudent.create({
      data: { tutorId: auth.tutor.id, studentId: studentUser.studentProfile.id },
    })
  } catch (err: unknown) {
    // Defense in depth: a concurrent request could win the race between the
    // check above and this insert.
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    if (code === 'P2002') {
      return NextResponse.json(
        { error: 'This student already has an active tutor and can\'t be assigned to another one.' },
        { status: 409 },
      )
    }
    throw err
  }

  return NextResponse.json({
    student: {
      id: studentUser.studentProfile.id,
      name: studentUser.studentProfile.name,
      email: studentUser.email,
      gradeLevel: studentUser.studentProfile.gradeLevel,
      mathTopics: studentUser.studentProfile.mathTopics,
    },
  })
})
