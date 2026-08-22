import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Children created by the parent-flow suite are StudentProfiles under a
// synthetic parent; deleting the parent User cascades to its ParentProfile but
// NOT to the child Users, so remove those first.
const parents = await prisma.user.findMany({
  where: { email: { contains: '+e2e-' } },
  include: { parentProfile: { include: { children: true } } },
})

for (const p of parents) {
  for (const child of p.parentProfile?.children ?? []) {
    await prisma.user.delete({ where: { id: child.userId } }).catch(() => {})
    console.log('  deleted child', child.name)
  }
  await prisma.user.delete({ where: { id: p.id } })
  console.log('deleted parent', p.email)
}

console.log('remaining synthetic users:', await prisma.user.count({ where: { email: { contains: '+e2e-' } } }))
console.log('remaining synthetic students:', await prisma.studentProfile.count({ where: { name: { contains: 'E2E Synthetic' } } }))
await prisma.$disconnect()
