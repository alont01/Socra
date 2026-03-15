import { prisma } from '@/lib/prisma'
import { fetchTranscriptWithRetry } from '@/lib/daily'
import { analyzeSession } from '@/lib/ai/session-analyzer'
import { generatePracticeSet } from '@/lib/ai/practice-set-generator'
import { config } from '@/lib/config'

const log = (msg: string) => console.log(`[session-processing] ${msg}`)
const logError = (msg: string, err: unknown) => console.error(`[session-processing] ${msg}`, err)

export async function processSessionPostCompletion(sessionId: string) {
  const session = await prisma.tutoringSession.findUnique({
    where: { id: sessionId },
    include: { tutor: true, student: true },
  })

  if (!session || !session.student) {
    log(`Session ${sessionId} not found or no student`)
    return
  }

  // Idempotency: skip if already processed
  const existingAnalysis = await prisma.sessionAnalysis.findUnique({
    where: { tutoringSessionId: sessionId },
  })
  if (existingAnalysis) {
    log(`Session ${sessionId} already processed, skipping`)
    return
  }

  const student = session.student

  // Step 1: Fetch and save transcript
  const transcriptText = await fetchAndSaveTranscript(sessionId, session.dailyRoomName, session.tutor.name, student.name)

  // Step 2: Analyze session
  const contentToAnalyze = transcriptText || session.tutorNotes || session.capturedNotes || 'No transcript or notes available.'
  const analysis = await analyzeAndSave(sessionId, {
    transcript: contentToAnalyze,
    tutorNotes: session.tutorNotes,
    capturedNotes: session.capturedNotes,
    studentName: student.name,
    studentGrade: student.gradeLevel,
    topic: session.topic,
    whiteboardImage: session.whiteboardImage || undefined,
  })

  if (!analysis) return // analysis failed and was logged

  // Step 3: Generate practice set
  await generateAndSavePracticeSet(sessionId, student.id, session.topic, analysis)

  // Step 4: Update mastery scores
  await updateMasteryForConcepts(student.id, analysis.conceptsCovered)

  log(`Completed processing for session ${sessionId}`)
}

async function fetchAndSaveTranscript(
  sessionId: string,
  dailyRoomName: string | null,
  tutorName: string,
  studentName: string,
): Promise<string> {
  let transcriptText = ''

  if (dailyRoomName) {
    try {
      const transcript = await fetchTranscriptWithRetry(dailyRoomName)
      transcriptText = transcript || ''
    } catch (err) {
      logError(`Failed to fetch transcript for session ${sessionId}`, err)
    }
  }

  // Save transcript even if empty (marks it as attempted)
  await prisma.transcript.upsert({
    where: { tutoringSessionId: sessionId },
    create: {
      tutoringSessionId: sessionId,
      content: transcriptText,
      speakers: JSON.stringify([tutorName, studentName]),
    },
    update: {
      content: transcriptText,
      speakers: JSON.stringify([tutorName, studentName]),
    },
  })

  return transcriptText
}

async function analyzeAndSave(
  sessionId: string,
  input: Parameters<typeof analyzeSession>[0],
) {
  try {
    const analysis = await analyzeSession(input)

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

    return analysis
  } catch (err) {
    logError(`Analysis failed for session ${sessionId}`, err)

    // Save a failed analysis so the UI can show an error state
    await prisma.sessionAnalysis.create({
      data: {
        tutoringSessionId: sessionId,
        summary: 'Analysis could not be generated. Please try again later.',
        conceptsCovered: '[]',
        studentStrengths: '[]',
        studentGaps: '[]',
        tutorFeedback: '',
      },
    })

    return null
  }
}

async function generateAndSavePracticeSet(
  sessionId: string,
  studentId: string,
  topic: string,
  analysis: { studentGaps: string[]; conceptsCovered: string[] },
) {
  try {
    const problems = await generatePracticeSet({
      studentGaps: analysis.studentGaps,
      conceptsCovered: analysis.conceptsCovered,
      studentGrade: '', // Already in the analysis context
      topic,
    })

    if (problems.length > 0) {
      await prisma.practiceSet.create({
        data: {
          tutoringSessionId: sessionId,
          studentId,
          title: `${topic} Practice`,
          problems: JSON.stringify(problems),
        },
      })
    }
  } catch (err) {
    logError(`Practice set generation failed for session ${sessionId}`, err)
    // Non-critical: don't fail the whole pipeline
  }
}

async function updateMasteryForConcepts(studentId: string, concepts: string[]) {
  const { initialSessionCoverage, sessionCoverageIncrement } = config.mastery

  for (const concept of concepts) {
    try {
      await prisma.studentProgress.upsert({
        where: { studentId_topic: { studentId, topic: concept } },
        create: { studentId, topic: concept, mastery: initialSessionCoverage },
        update: { mastery: { increment: sessionCoverageIncrement } },
      })
    } catch (err) {
      logError(`Failed to update mastery for concept "${concept}"`, err)
    }
  }
}
