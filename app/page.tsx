'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Navbar } from '@/components/Navbar'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <Navbar />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-sm font-medium mb-8">
          <span>Live tutoring + AI-powered insights</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-stone-900 mb-6 leading-tight">
          Tutoring that gets{' '}
          <span className="text-orange-500">smarter</span> every session
        </h1>

        <p className="text-xl text-stone-500 max-w-2xl mx-auto mb-10">
          Socra pairs live tutor-student video sessions with AI analysis.
          After each session, get summaries, targeted practice, and progress tracking — automatically.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/auth">
            <Button size="lg" className="text-base px-8">
              Get Started Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-stone-900 text-center mb-12">
          How Socra works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '📹',
              title: 'Live Video Sessions',
              desc: 'Tutors and students meet in one-on-one video calls. Tutors take notes while teaching.',
            },
            {
              icon: '🧠',
              title: 'AI Session Scribe',
              desc: 'After each session, AI analyzes the conversation to identify strengths, gaps, and coaching tips.',
            },
            {
              icon: '📈',
              title: 'Targeted Practice',
              desc: 'Students get personalized practice sets based on their session gaps, with mastery tracking over time.',
            },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-stone-900 mb-2">{f.title}</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="bg-orange-500 rounded-3xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to transform your tutoring?</h2>
          <p className="text-orange-100 mb-8 text-lg">Join tutors and students building real math understanding with Socra.</p>
          <Link href="/auth">
            <button className="bg-white text-orange-600 font-semibold px-8 py-3 rounded-xl hover:bg-orange-50 transition-colors">
              Get Started Free
            </button>
          </Link>
        </div>
      </section>

      <footer className="text-center py-8 text-stone-400 text-sm">
        &copy; 2026 Socra
      </footer>
    </div>
  )
}
