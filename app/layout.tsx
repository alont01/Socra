import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'

export const metadata: Metadata = {
  title: 'Socra — Your AI Math Tutor',
  description: 'Personalized AI math tutoring using the Socratic method',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FFFBF5]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
