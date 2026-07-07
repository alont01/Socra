import { randomBytes } from 'crypto'

// Unambiguous alphabet (no 0/O/1/I/L) for human-typable invite codes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * Generate a random, URL- and human-friendly invite code, e.g. "K7QMP2XR".
 * Uses crypto randomness; collisions are astronomically unlikely but the caller
 * should still rely on the unique DB constraint.
 */
export function generateInviteCode(length = 8): string {
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return code
}
