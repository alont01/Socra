import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [Google, GitHub],
  callbacks: {
    async signIn({ user }) {
      return !!user.email
    },
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          // OAuth providers verify the email, so mark it verified.
          update: { emailVerified: true },
          create: { email: user.email, passwordHash: null, role: 'STUDENT', emailVerified: true },
        })
        token.dbUserId = dbUser.id
        token.dbUserRole = dbUser.role
        token.dbUserEmail = dbUser.email
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.dbUserId as string
      session.user.role = token.dbUserRole as string
      return session
    },
  },
  pages: { signIn: "/auth", error: "/auth" },
})

declare module "next-auth" {
  interface Session { user: { id: string; email: string; role: string } }
}
declare module "@auth/core/jwt" {
  interface JWT { dbUserId?: string; dbUserRole?: string; dbUserEmail?: string }
}
