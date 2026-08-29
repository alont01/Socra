// Seeds a local development database with a realistic scenario, including the
// states that are otherwise hard to reach by hand: a session whose analysis
// failed, one where nothing was captured, homework with a missing answer key,
// and a scheduled session a student can sit in front of while waiting.
//
// LOCAL ONLY. Refuses to run against anything but localhost so it can't be
// pointed at a deployed database by accident.
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const url = process.env.DATABASE_URL || ''
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('Refusing to seed: DATABASE_URL is not a localhost database.')
  process.exit(1)
}

const prisma = new PrismaClient()
const hash = await bcrypt.hash('Password!2026', 10)

// Clean slate so re-running is safe.
await prisma.user.deleteMany({ where: { email: { contains: '@local.test' } } })

const tutorUser = await prisma.user.create({
  data: {
    email: 'tutor@local.test', passwordHash: hash, role: 'TUTOR', emailVerified: true,
    tutorProfile: { create: { name: 'Dana Tutor', bio: 'Algebra and geometry.' } },
  },
  include: { tutorProfile: true },
})

const parentUser = await prisma.user.create({
  data: {
    email: 'parent@local.test', passwordHash: hash, role: 'PARENT', emailVerified: true,
    parentProfile: { create: { name: 'Sam Parent' } },
  },
  include: { parentProfile: true },
})

const studentUser = await prisma.user.create({
  data: {
    email: 'student@local.test', username: 'maya42', passwordHash: hash,
    role: 'STUDENT', emailVerified: true,
    studentProfile: {
      create: {
        name: 'Maya', gradeLevel: '9th grade', goals: 'Get confident with algebra',
        onboardingDone: true, parentId: parentUser.parentProfile.id,
      },
    },
  },
  include: { studentProfile: true },
})

const tutor = tutorUser.tutorProfile
const student = studentUser.studentProfile

await prisma.tutorStudent.create({ data: { tutorId: tutor.id, studentId: student.id } })

const mkSession = (topic, status, extra = {}) =>
  prisma.tutoringSession.create({
    data: { tutorId: tutor.id, studentId: student.id, topic, status, scheduledMinutes: 60, ...extra },
  })

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000)

// 1. Scheduled — the student-side "waiting for your tutor" card.
await mkSession('Quadratics', 'scheduled', { scheduledAt: new Date(Date.now() + 3_600_000) })

// 2. Completed with a good analysis — the happy path recap, and billable hours.
const good = await mkSession('Factoring', 'completed', {
  startedAt: hoursAgo(26), endedAt: hoursAgo(25), tutorNotes: 'Worked through factoring by grouping.',
})
await prisma.sessionAnalysis.create({
  data: {
    tutoringSessionId: good.id, status: 'ok',
    summary: 'Maya worked through factoring quadratics and grew more confident with grouping.',
    conceptsCovered: JSON.stringify(['factoring', 'grouping']),
    studentStrengths: JSON.stringify(['pulling out common factors']),
    studentGaps: JSON.stringify(['leading coefficient ≠ 1']),
    tutorFeedback: 'Slow down on the setup step.',
  },
})

// 3. Completed but the analysis FAILED — previously rendered as the recap.
const failed = await mkSession('Slope', 'completed', {
  startedAt: hoursAgo(50), endedAt: hoursAgo(49), tutorNotes: 'Covered slope-intercept form.',
})
await prisma.sessionAnalysis.create({
  data: {
    tutoringSessionId: failed.id, status: 'failed',
    summary: 'Analysis could not be generated. Please try again later.',
    conceptsCovered: '[]', studentStrengths: '[]', studentGaps: '[]', tutorFeedback: '',
  },
})

// 4. Completed with nothing captured — the notes-and-retry flow.
const thin = await mkSession('Word problems', 'completed', {
  startedAt: hoursAgo(74), endedAt: hoursAgo(73),
})
await prisma.sessionAnalysis.create({
  data: {
    tutoringSessionId: thin.id, status: 'insufficient',
    summary: 'Not enough was captured from this session to generate an analysis. Add tutor notes (or make sure the session was recorded), then retry.',
    conceptsCovered: '[]', studentStrengths: '[]', studentGaps: '[]', tutorFeedback: '',
  },
})

// Homework: one assigned and gradeable, one draft missing an answer key (the
// assign guard should refuse it).
await prisma.practiceSet.create({
  data: {
    tutoringSessionId: good.id, studentId: student.id, title: 'Factoring Homework',
    status: 'assigned', assignedAt: new Date(),
    problems: JSON.stringify([
      { id: 'p1', question: 'Factor: x^2 - 9', hint: 'Difference of squares', difficulty: 'easy', topic: 'factoring', answer: '(x-3)(x+3)' },
      { id: 'p2', question: 'Solve: 3x + 5 = 20', hint: 'Isolate x', difficulty: 'easy', topic: 'algebra', answer: '5' },
      { id: 'p3', question: 'Factor: 2x^2 + 7x + 3', hint: 'Try grouping', difficulty: 'medium', topic: 'factoring', answer: '(2x+1)(x+3)' },
    ]),
  },
})
await prisma.practiceSet.create({
  data: {
    tutoringSessionId: good.id, studentId: student.id, title: 'Draft — missing answer',
    status: 'draft',
    problems: JSON.stringify([
      { id: 'd1', question: 'Factor: x^2 - 16', hint: '', difficulty: 'easy', topic: 'factoring', answer: '(x-4)(x+4)' },
      { id: 'd2', question: 'Factor: x^2 + 5x + 6', hint: '', difficulty: 'medium', topic: 'factoring', answer: '' },
    ]),
  },
})

for (const [topic, mastery] of [['factoring', 0.62], ['algebra', 0.81], ['grouping', 0.35]]) {
  await prisma.studentProgress.create({ data: { studentId: student.id, topic, mastery } })
  await prisma.masteryHistory.create({ data: { studentId: student.id, topic, mastery, source: 'session' } })
}

console.log(JSON.stringify({
  tutor: 'tutor@local.test', parent: 'parent@local.test',
  student: 'student@local.test (username maya42)', password: 'Password!2026',
  sessions: { good: good.id, failed: failed.id, insufficient: thin.id },
}, null, 2))

await prisma.$disconnect()
