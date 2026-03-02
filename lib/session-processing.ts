import { prisma } from '@/lib/prisma'
import { fetchTranscriptWithRetry } from '@/lib/daily'
import { analyzeSession } from '@/lib/ai/session-analyzer'
import { generatePracticeSet } from '@/lib/ai/practice-set-generator'

export async function processSessionPostCompletion(sessionId: string) {
  const session = await prisma.tutoringSession.findUnique({
    where: { id: sessionId },
    include: {
      tutor: true,
      student: true,
    },
  })

  if (!session || !session.student) {
    console.log(`[session-processing] Session ${sessionId} not found or no student`)
    return
  }

  // 1. Fetch transcript from Daily.co
  let transcriptText = ''
  if (session.dailyRoomName) {
    const transcript = await fetchTranscriptWithRetry(session.dailyRoomName)
    transcriptText = transcript || ''
  }

  // Save transcript
  await prisma.transcript.create({
    data: {
      tutoringSessionId: sessionId,
      content: transcriptText,
      speakers: JSON.stringify([session.tutor.name, session.student.name]),
    },
  })

  // If no transcript content, create a minimal analysis from tutor notes
  const contentToAnalyze = transcriptText || session.tutorNotes || 'No transcript or notes available.'

  // 2. Analyze session
  const analysis = await analyzeSession({
    transcript: contentToAnalyze,
    tutorNotes: session.tutorNotes,
    studentName: session.student.name,
    studentGrade: session.student.gradeLevel,
    topic: session.topic,
  })

  // Save analysis
  await prisma.sessionAnalysis.create({
    data: {
      tutoringSessionId: sessionId,
      summary: analysis.summary,
      conceptsCovered: JSON.stringify(analysis.conceptsCovered),
      studentStrengths: JSON.stringify(analysis.studentStrengths),
      studentGaps: JSON.stringify(analysis.studentGaps),
      tutorFeedback: analysis.tutorFeedback,
    },
  })

  // 3. Generate practice set from gaps
  const problems = await generatePracticeSet({
    studentGaps: analysis.studentGaps,
    conceptsCovered: analysis.conceptsCovered,
    studentGrade: session.student.gradeLevel,
    topic: session.topic,
  })

  if (problems.length > 0) {
    await prisma.practiceSet.create({
      data: {
        tutoringSessionId: sessionId,
        studentId: session.student.id,
        title: `${session.topic} Practice`,
        problems: JSON.stringify(problems),
      },
    })
  }

  // 4. Update student progress for covered concepts
  for (const concept of analysis.conceptsCovered) {
    await prisma.studentProgress.upsert({
      where: {
        studentId_topic: {
          studentId: session.student.id,
          topic: concept,
        },
      },
      create: {
        studentId: session.student.id,
        topic: concept,
        mastery: 0.3, // Initial mastery from covering a topic
      },
      update: {
        // Exponential moving average: new = alpha * new_value + (1-alpha) * old
        // We'll just bump it slightly for covering it in a session
        mastery: { increment: 0.1 },
      },
    })
  }

  console.log(`[session-processing] Completed processing for session ${sessionId}`)
}
