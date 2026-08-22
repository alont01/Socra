// Seeds a VERIFIED synthetic parent so E2E can exercise authenticated parent
// flows. Verification normally requires an emailed code that is stored only as
// a hash, so a test can't complete it — seeding directly is the only way in
// without weakening the real verification path.
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const stamp = Date.now()
const email = `alon.trogan+e2e-parent-${stamp}@gmail.com`
const password = 'E2eSynthetic!2026'

const user = await prisma.user.create({
  data: {
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'PARENT',
    emailVerified: true,
    parentProfile: { create: { name: 'E2E Synthetic Parent' } },
  },
})

console.log(JSON.stringify({ email, password, userId: user.id }))
await prisma.$disconnect()
