// Centralized configuration constants

export const config = {
  // Daily.co
  daily: {
    roomExpirySeconds: 60 * 60 * 3, // 3 hours
    maxParticipants: 2,
    // Daily can take a couple of minutes to finish transcription after a call
    // ends; 12 × 15s ≈ 3 minutes of polling before we fall back to notes.
    transcriptRetryIntervalMs: 15_000,
    transcriptMaxRetries: 12,
  },

  // Mastery scoring
  mastery: {
    alpha: 0.3, // EMA weight for new observations
    initialSessionCoverage: 0.3, // mastery when topic first covered in a session
    sessionCoverageIncrement: 0.1, // mastery bump for re-covering a topic
  },

  // AI
  ai: {
    analysisModel: 'claude-sonnet-4-6' as const,
    analysisMaxTokens: 2048,
    practiceModel: 'claude-sonnet-4-6' as const,
    practiceMaxTokens: 2048,
    practiceProblemsCount: 5,
    noteExtractorModel: 'claude-sonnet-4-6' as const,
    studentChatModel: 'claude-sonnet-4-6' as const,
    studentChatMaxTokens: 3072, // higher ceiling so responses with plots/figures aren't truncated
    livePracticeModel: 'claude-sonnet-4-6' as const,
    livePracticeMaxTokens: 1536,
    livePracticeCount: 3,
    onboardingModel: 'claude-opus-4-8' as const,
    onboardingMaxTokens: 2048,
    assessmentModel: 'claude-sonnet-4-6' as const,
    assessmentMaxTokens: 1024, // one problem at a time
    assessmentSummaryMaxTokens: 1536,
  },

  // Adaptive assessment
  assessment: {
    minLevel: 1,
    maxLevel: 10,
    startLevel: 5, // used when no prior mastery data exists for the topic
    maxItems: 10,
    // Stop early once the last N levels are within this range of each other
    // (e.g. 6,7,6 → range 1 → converged) instead of always running to maxItems.
    convergenceWindow: 3,
    convergenceRange: 1,
  },

  // Monthly billing — flat hourly rate applied to every family. Override with
  // HOURLY_RATE_USD (env) without a code change if pricing changes.
  billing: {
    hourlyRateUsd: Number(process.env.HOURLY_RATE_USD) || 75,
    currency: 'usd',
    // Length assumed for a session when none was specified.
    defaultSessionMinutes: 60,
    // Allowance over the scheduled length before billing stops counting. Covers
    // a session that naturally runs a few minutes long, while still capping the
    // "tutor forgot to click End" case. Billing never charges beyond
    // scheduledMinutes + this. Set BILLING_GRACE_MINUTES=0 for a hard cap.
    // Note the explicit empty-string check: `Number('')` is 0, so a set-but-blank
    // env var would silently mean "hard cap" rather than "use the default".
    graceMinutes:
      (process.env.BILLING_GRACE_MINUTES ?? '').trim() !== '' &&
      Number.isFinite(Number(process.env.BILLING_GRACE_MINUTES))
        ? Math.max(0, Number(process.env.BILLING_GRACE_MINUTES))
        : 10,
    // Invoices are due this many days after being sent.
    invoiceDueDays: 14,
  },

  // Live sessions
  session: {
    // An 'active' session older than this is assumed abandoned and is closed by
    // the sweeper. Daily's room already expires at 3h (daily.roomExpirySeconds),
    // so nothing legitimate is still running past this.
    staleAfterHours: 4,
  },

  // Auth
  auth: {
    jwtExpirySeconds: 60 * 60 * 24 * 7, // 7 days
    passwordResetExpiryMinutes: 60,
    bcryptSaltRounds: 12,
  },

  // Observability
  observability: {
    // A request slower than this is logged at warn level. Set above the normal
    // ceiling for AI-backed routes so ordinary model latency isn't flagged.
    slowRequestMs: Number(process.env.SLOW_REQUEST_MS) || 3_000,
  },

  // Whiteboard
  whiteboard: {
    syncDebounceMs: 150,
    canvasHeightMultiplier: 3,
    eraserWidthMultiplier: 4,
  },
} as const
