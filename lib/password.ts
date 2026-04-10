import bcrypt from 'bcryptjs'
import { config } from '@/lib/config'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.auth.bcryptSaltRounds)
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
