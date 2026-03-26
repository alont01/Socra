import { prisma } from '@/lib/prisma'
import { fetchTranscriptWithRetry } from '@/lib/daily'
import { analyzeSession } from '@/lib/ai/session-analyzer'
import { generatePracticeSet } from '@/lib/ai/practice-set-generator'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('session-processing')

export async function processSessionPostCompletion(sessionId: string) {
  const session = await prisma.tutoringSession.findUnique({
    where: { id: sessionId },
    include: { tutor: true, student: true },
  })

  if (!session || !session.student) {
    logger.info('Session not found or no student', { sessionId })
    return
  }

  // Idempotency: skip if already processed (use atomic upsert-style check)
  const existingAnalysis = await prisma.sessionAnalysis.findUnique({
    where: { tutoringSessionId: sessionId },
  })
  if (existingAnalysis) {
    logger.info('Session already processed, skipping', { sessionId })
    return
  }

  const student = session.student

  // Step 1: Fetch and save transcript
  const transcriptText = await fetchAndSaveTranscript(sessionId, session.dailyRoomName, session.tutor.name, student.name)

  // Step 2: Analyze session
  const contentToAnalyze = transcriptText || session.tutorNotes || session.capturedNotes || 'No transcript or notes available.'
  if (!transcriptText) {
    logger.warn('No transcript available, falling back to notes', { sessionId, hasNotes: !!session.tutorNotes, hasCaptured: !!session.capturedNotes })
  }

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

  logger.info('Completed processing', { sessionId })
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
      logger.error('Failed to fetch transcript', err, { sessionId })
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

    // Use upsert to prevent unique constraint violation from concurrent calls
    await prisma.sessionAnalysis.upsert({
      where: { tutoringSessionId: sessionId },
      create: {
        tutoringSessionId: sessionId,
        summary: analysis.summary,
        conceptsCovered: JSON.stringify(analysis.conceptsCovered),
        studentStrengths: JSON.stringify(analysis.studentStrengths),
        studentGaps: JSON.stringify(analysis.studentGaps),
        tutorFeedback: analysis.tutorFeedback,
      },
      update: {
        summary: analysis.summary,
        conceptsCovered: JSON.stringify(analysis.conceptsCovered),
        studentStrengths: JSON.stringify(analysis.studentStrengths),
        studentGaps: JSON.stringify(analysis.studentGaps),
        tutorFeedback: analysis.tutorFeedback,
      },
    })

    return analysis
  } catch (err) {
    logger.error('Analysis failed', err, { sessionId })

    // Save a failed analysis so the UI can show an error state
    try {
      await prisma.sessionAnalysis.upsert({
        where: { tutoringSessionId: sessionId },
        create: {
          tutoringSessionId: sessionId,
          summary: 'Analysis could not be generated. Please try again later.',
          conceptsCovered: '[]',
          studentStrengths: '[]',
          studentGaps: '[]',
          tutorFeedback: '',
        },
        update: {},  // Don't overwrite real analysis if one exists
      })
    } catch (upsertErr) {
      logger.error('Failed to save placeholder analysis', upsertErr, { sessionId })
    }

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
    logger.error('Practice set generation failed', err, { sessionId })
    // Non-critical: don't fail the whole pipeline
  }
}

async function updateMasteryForConcepts(studentId: string, concepts: string[]) {
  const { initialSessionCoverage, sessionCoverageIncrement } = config.mastery

  for (const concept of concepts) {
    try {
      // Use a transaction to make the read-then-update atomic, preventing
      // concurrent session completions from losing increments
      await prisma.$transaction(async (tx) => {
        const existing = await tx.studentProgress.findUnique({
          where: { studentId_topic: { studentId, topic: concept } },
        })

        if (existing) {
          const newMastery = Math.min(1.0, existing.mastery + sessionCoverageIncrement)
          await tx.studentProgress.update({
            where: { id: existing.id },
            data: { mastery: newMastery },
          })
        } else {
          await tx.studentProgress.create({
            data: { studentId, topic: concept, mastery: initialSessionCoverage },
          })
        }
      })
    } catch (err) {
      logger.error(`Failed to update mastery for concept "${concept}"`, err, { studentId })
    }
  }
}
