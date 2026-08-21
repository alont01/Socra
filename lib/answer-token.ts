import crypto from 'crypto'

let cachedKey: Buffer | undefined

/**
 * AES key derived from AUTH_SECRET.
 *
 * Derived lazily and memoized rather than at module load: `next build`
 * evaluates route modules to collect page data, and a top-level throw here
 * failed the *build* when AUTH_SECRET wasn't present in the build environment.
 * Production still refuses to mint or read a token without a real secret.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const secret = process.env.AUTH_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET environment variable is required in production')
  }

  cachedKey = crypto.createHash('sha256').update(secret || 'dev-only-answer-token-secret').digest()
  return cachedKey
}

/**
 * Encrypts the correct answer + topic into a tamper-proof token.
 * The student receives this token but cannot extract the answer.
 * The server decrypts it when the student submits to grade the answer.
 */
export function createAnswerToken(
  data: { answer: string; topic: string },
  sessionId: string,
  problemId: string,
): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)

  const payload = JSON.stringify({ a: data.answer, t: data.topic, s: sessionId, p: problemId })
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

/**
 * Decrypts an answer token and verifies it belongs to the given session/problem.
 * Returns the correct answer and topic, or null if invalid/tampered.
 */
export function decryptAnswerToken(
  token: string,
  sessionId: string,
  problemId: string,
): { answer: string; topic: string } | null {
  try {
    const buf = Buffer.from(token, 'base64url')
    if (buf.length < 29) return null // iv(12) + tag(16) + at least 1 byte

    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const encrypted = buf.subarray(28)

    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    const payload = JSON.parse(decrypted.toString('utf8'))

    if (payload.s !== sessionId || payload.p !== problemId) return null

    return { answer: payload.a, topic: payload.t }
  } catch {
    return null
  }
}
