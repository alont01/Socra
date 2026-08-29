import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { route } from '@/lib/api-handler'
import { displayIdentity, isInternalStudentEmail } from '@/lib/student-handle'

export const GET = route('tutor/students', async () => {
  const auth = await requireTutor()
  if (!auth.ok) return auth.response

  const roster = await prisma.tutorStudent.findMany({
    where: { tutorId: auth.tutor.id },
    include: {
      student: {
        include: {
          user: { select: { email: true, username: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const students = roster.map((r) => ({
    id: r.student.id,
    name: r.student.name,
    // A parent-created child has no real address — `identity` is what to show a
    // tutor (their username), while `email` is null so nothing can present the
    // synthetic internal address as a way to contact them.
    identity: displayIdentity(r.student.user.email, r.student.user.username),
    email: isInternalStudentEmail(r.student.user.email) ? null : r.student.user.email,
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
    // Don't send the tutor away with an instruction the other person can't
    // follow: switching your own role is super-admin only (see
    // /api/profile/role), and Settings tells ordinary users exactly that. A
    // parent who wants their child tutored adds the child from their own
    // dashboard, which is the route that actually exists.
    const msg =
      studentUser.role === 'STUDENT'
        ? "That person signed in but hasn't finished setting up their student profile yet. Ask them to log in and complete onboarding."
        : studentUser.role === 'PARENT'
          ? "That's a parent account, not a student. Ask them to add their child from their own dashboard — the child gets their own login, and you'll be matched automatically."
          : `That account is a ${studentUser.role.toLowerCase()}, not a student.`
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
      // Same shape as GET, so the roster renders an added student identically
      // to one it loaded from the server.
      identity: displayIdentity(studentUser.email, studentUser.username),
      email: isInternalStudentEmail(studentUser.email) ? null : studentUser.email,
      gradeLevel: studentUser.studentProfile.gradeLevel,
      mathTopics: studentUser.studentProfile.mathTopics,
    },
  })
})
