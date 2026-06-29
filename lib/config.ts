// Centralized configuration constants

export const config = {
  // Daily.co
  daily: {
    roomExpirySeconds: 60 * 60 * 3, // 3 hours
    maxParticipants: 2,
    transcriptRetryIntervalMs: 10_000,
    transcriptMaxRetries: 5,
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
    studentChatMaxTokens: 1024,
    livePracticeModel: 'claude-sonnet-4-6' as const,
    livePracticeMaxTokens: 1536,
    livePracticeCount: 3,
    onboardingModel: 'claude-opus-4-8' as const,
    onboardingMaxTokens: 2048,
  },

  // Auth
  auth: {
    jwtExpirySeconds: 60 * 60 * 24 * 7, // 7 days
    passwordResetExpiryMinutes: 60,
    bcryptSaltRounds: 12,
  },

  // Whiteboard
  whiteboard: {
    syncDebounceMs: 150,
    canvasHeightMultiplier: 3,
    eraserWidthMultiplier: 4,
  },
} as const
