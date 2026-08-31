// Centralized configuration constants

export const config = {
  // Daily.co
  // The app's canonical wall-clock timezone. Availability blocks, scheduling,
  // and anything shown to a family are all in this zone (see lib/availability).
  // Server-rendered dates MUST pass this to toLocaleString: Node inherits the
  // host's zone, which is UTC on Render, so omitting it silently emails people
  // a time several hours off.
  timeZone: 'America/New_York',

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
  //
  // Model choice is per-task, not one house model. The three jobs where being
  // wrong is expensive — a visualization whose geometry doesn't hold up, a
  // practice problem with a bad answer key, an assessment item pitched at the
  // wrong level — run on Sonnet 5, which thinks adaptively by default and is
  // markedly faster than Opus 5 (these run while a tutor or student waits).
  // Verified on the visualize path with `npm run eval:visualize`; re-run that
  // before moving any of these to a smaller or older model.
  //
  // IMPORTANT: thinking tokens count against `max_tokens`. The ceilings below
  // are sized for reasoning + output; halving one truncates the answer
  // mid-thought rather than producing a shorter answer.
  ai: {
    analysisModel: 'claude-sonnet-4-6' as const,
    analysisMaxTokens: 2048,
    // Practice problems are graded automatically, so a wrong answer key marks a
    // correct student wrong. Runs in the post-session pipeline — nobody waiting.
    practiceModel: 'claude-sonnet-5' as const,
    practiceMaxTokens: 8000,
    practiceProblemsCount: 5,
    noteExtractorModel: 'claude-sonnet-4-6' as const,
    studentChatModel: 'claude-sonnet-4-6' as const,
    studentChatMaxTokens: 3072, // higher ceiling so responses with plots/figures aren't truncated
    livePracticeModel: 'claude-sonnet-4-6' as const,
    livePracticeMaxTokens: 1536,
    livePracticeCount: 3,
    onboardingModel: 'claude-opus-4-8' as const,
    onboardingMaxTokens: 2048,
    assessmentModel: 'claude-sonnet-5' as const,
    assessmentMaxTokens: 4000, // one problem at a time, plus room to reason it through
    assessmentSummaryMaxTokens: 6000,
    // The hardest job in the app: plan a pedagogical build-up AND compute
    // coordinates that actually hold (four congruent triangles that really do
    // pack into the square). Spatial reasoning is where a weaker model produces
    // something plausible-looking and geometrically wrong.
    visualizeModel: 'claude-sonnet-5' as const,
    visualizeMaxTokens: 16000,
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
    // A `completed` session with a student but no SessionAnalysis row this long
    // after `endedAt` means the fire-and-forget post-session pipeline (started
    // by POST /end) died before writing anything at all — not a placeholder
    // ('failed'/'insufficient', which the review page can already retry), just
    // nothing. Comfortably past the transcript retry ceiling
    // (transcriptMaxRetries × transcriptRetryIntervalMs = 3 min) plus the AI
    // calls, so a merely-slow pipeline is never mistaken for a dead one.
    staleAnalysisAfterMinutes: 30,
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
