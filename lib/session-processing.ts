import { prisma } from '@/lib/prisma'
import { fetchTranscriptWithRetry } from '@/lib/daily'
import { analyzeSession } from '@/lib/ai/session-analyzer'
import { generatePracticeSet } from '@/lib/ai/practice-set-generator'
import { config } from '@/lib/config'
import { applyMastery } from '@/lib/progress'
import { createLogger } from '@/lib/logger'
import { recordEvent } from '@/lib/metrics'

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

  // Guard: if nothing meaningful was captured (no transcript, no notes, no
  // whiteboard), don't ask the model to analyze "nothing" — it would
  // hallucinate. Save a clear, retryable state and stop.
  const hasWhiteboard = !!session.whiteboardImage
  // The live-caption buffer is a better fallback than notes when the Daily VTT
  // fetch comes back empty (it's the actual dialogue).
  const bestTranscript = transcriptText || session.liveTranscript || ''
  if (!hasMeaningfulContent(bestTranscript, session.tutorNotes, session.capturedNotes, hasWhiteboard)) {
    logger.warn('Insufficient content to analyze', { sessionId })
    await saveInsufficientAnalysis(sessionId)
    recordEvent({
      category: 'session',
      name: 'session.processed',
      level: 'warn',
      success: false,
      metadata: { sessionId, reason: 'insufficient_content' },
    })
    return
  }

  // Step 2: Analyze session
  const contentToAnalyze = transcriptText || session.liveTranscript || session.tutorNotes || session.capturedNotes || ''
  if (!transcriptText) {
    logger.warn('No VTT transcript; falling back', { sessionId, hasLive: !!session.liveTranscript, hasNotes: !!session.tutorNotes, hasCaptured: !!session.capturedNotes })
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
  await generateAndSavePracticeSet(sessionId, student.id, student.gradeLevel, session.topic, analysis)

  // Step 4: Update mastery scores — only once per session. Re-analysis (retry)
  // re-runs this pipeline; without a guard each retry would re-apply the
  // concept-coverage increments and inflate mastery. We only mark it applied
  // once real concepts have been counted, so a retry after a failed/empty
  // first analysis still applies mastery exactly once.
  //
  // The guard has to be an atomic claim, not a read-then-write against the
  // `session` snapshot taken at the top of this function: a retry fired while
  // the first pipeline was still mid-flight (transcript polling + the AI call
  // both take real time) reads that same `masteryApplied: false` snapshot and
  // would double-apply the bump. The conditional updateMany is the arbiter —
  // same pattern as /end, the live-practice override, and the billing claim —
  // so only the invocation that actually flips false→true may apply it.
  if (analysis.conceptsCovered.length > 0) {
    const claimed = await prisma.tutoringSession.updateMany({
      where: { id: sessionId, masteryApplied: false },
      data: { masteryApplied: true },
    })
    if (claimed.count > 0) {
      await updateMasteryForConcepts(student.id, analysis.conceptsCovered)
    }
  }

  logger.info('Completed processing', { sessionId })
  recordEvent({
    category: 'session',
    name: 'session.processed',
    success: true,
    metadata: { sessionId, usedTranscript: !!transcriptText },
  })
}

// Enough signal to analyze? A whiteboard drawing alone counts; otherwise we
// need a reasonable amount of transcript/notes text (not just a stray word).
export function hasMeaningfulContent(
  transcript: string,
  tutorNotes: string,
  capturedNotes: string,
  hasWhiteboard: boolean,
): boolean {
  if (hasWhiteboard) return true
  const combined = [transcript, tutorNotes, capturedNotes]
    .map((t) => (t || '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return combined.length >= 25
}

// Save a clear, retryable "not enough captured" analysis (mirrors the failure
// placeholder). Empty concepts mean the review UI shows its retry affordance.
async function saveInsufficientAnalysis(sessionId: string) {
  try {
    await prisma.sessionAnalysis.upsert({
      where: { tutoringSessionId: sessionId },
      create: {
        tutoringSessionId: sessionId,
        // `status` is what every reader keys off; this text is only ever shown
        // to the tutor, who is the one who can act on it.
        status: 'insufficient',
        summary:
          "Not enough was captured from this session to generate an analysis. Add tutor notes (or make sure the session was recorded), then retry.",
        conceptsCovered: '[]',
        studentStrengths: '[]',
        studentGaps: '[]',
        tutorFeedback: '',
      },
      update: {}, // never overwrite a real analysis
    })
  } catch (err) {
    logger.error('Failed to save insufficient-content analysis', err, { sessionId })
  }
}

async function fetchAndSaveTranscript(
  sessionId: string,
  dailyRoomName: string | null,
  tutorName: string,
  studentName: string,
): Promise<string> {
  let transcriptText = ''

  if (dailyRoomName) {
    const start = Date.now()
    try {
      const transcript = await fetchTranscriptWithRetry(dailyRoomName)
      transcriptText = transcript || ''
      recordEvent({
        category: 'transcript',
        name: 'transcript.fetch',
        success: !!transcriptText,
        level: transcriptText ? 'info' : 'warn',
        durationMs: Date.now() - start,
        metadata: { sessionId, chars: transcriptText.length },
      })
    } catch (err) {
      logger.error('Failed to fetch transcript', err, { sessionId })
      recordEvent({
        category: 'transcript',
        name: 'transcript.fetch',
        success: false,
        level: 'error',
        durationMs: Date.now() - start,
        metadata: { sessionId, error: err instanceof Error ? err.message : String(err) },
      })
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

    const fields = {
      status: 'ok',
      summary: analysis.summary,
      conceptsCovered: JSON.stringify(analysis.conceptsCovered),
      studentStrengths: JSON.stringify(analysis.studentStrengths),
      studentGaps: JSON.stringify(analysis.studentGaps),
      tutorFeedback: analysis.tutorFeedback,
    }

    // Use upsert to prevent unique constraint violation from concurrent calls.
    // A real analysis DOES replace a placeholder — that's the retry path
    // succeeding, and `status` flipping to 'ok' is what unblocks the student
    // and parent views.
    await prisma.sessionAnalysis.upsert({
      where: { tutoringSessionId: sessionId },
      create: { tutoringSessionId: sessionId, ...fields },
      update: fields,
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
          status: 'failed',
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
  studentGrade: string,
  topic: string,
  analysis: { studentGaps: string[]; conceptsCovered: string[] },
) {
  try {
    const problems = await generatePracticeSet({
      studentGaps: analysis.studentGaps,
      conceptsCovered: analysis.conceptsCovered,
      studentGrade,
      topic,
    })

    if (problems.length > 0) {
      // Created as a draft — the tutor reviews and assigns it as homework.
      await prisma.practiceSet.create({
        data: {
          tutoringSessionId: sessionId,
          studentId,
          title: `${topic} Homework`,
          problems: JSON.stringify(problems),
          status: 'draft',
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
      await applyMastery(studentId, concept, 'session', (current) =>
        current === null ? initialSessionCoverage : current + sessionCoverageIncrement,
      )
    } catch (err) {
      logger.error(`Failed to update mastery for concept "${concept}"`, err, { studentId })
    }
  }
}
