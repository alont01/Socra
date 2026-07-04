'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Navbar } from '@/components/Navbar'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const features = [
  {
    title: 'Live Video Sessions',
    desc: 'Tutors and students meet in one-on-one video calls. Tutors take notes while teaching.',
    icon: (
      <path
        d="M4 8a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm11 3 4-2.5v7L15 13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'AI Session Scribe',
    desc: 'After each session, AI analyzes the conversation to identify strengths, gaps, and coaching tips.',
    icon: (
      <path
        d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.7-6.7-1.4 1.4M6.7 17.3l-1.4 1.4m12.4 0-1.4-1.4M6.7 6.7 5.3 5.3M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Targeted Practice',
    desc: 'Students get personalized practice sets based on their session gaps, with mastery tracking over time.',
    icon: (
      <path
        d="M4 19V5m0 14h16M7 15l3.5-3.5 3 3L20 8m0 0h-4m4 0v4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard')
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen bg-[#FFFBF5] overflow-hidden">
      <Navbar />

      {/* Hero */}
      <section className="relative">
        {/* Ambient floating blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-orange-300/25 blur-3xl animate-float-slow" />
          <div className="absolute top-10 right-0 h-80 w-80 rounded-full bg-amber-200/30 blur-3xl animate-float-slow [animation-delay:-4s]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur ring-1 ring-orange-200/70 text-orange-700 px-4 py-1.5 rounded-full text-sm font-medium mb-8 shadow-soft animate-fade-in-up">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
            </span>
            Live tutoring + AI-powered insights
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-stone-900 mb-6 leading-[1.05] animate-fade-in-up [animation-delay:60ms]">
            Tutoring that gets{' '}
            <span className="text-gradient-brand">smarter</span> every session
          </h1>

          <p className="text-lg md:text-xl text-stone-500 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up [animation-delay:120ms]">
            Socra pairs live tutor-student video sessions with AI analysis.
            After each session, get summaries, targeted practice, and progress tracking — automatically.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap animate-fade-in-up [animation-delay:180ms]">
            <Link href="/auth">
              <Button size="lg" className="text-base px-8">
                Get Started Free
              </Button>
            </Link>
            <Link href="/auth">
              <Button size="lg" variant="ghost" className="text-base px-6">
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-stone-900 text-center mb-14">
          How Socra works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group bg-white/95 rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-7 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-elevated hover:ring-orange-200/70 animate-fade-in-up"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="mb-5 grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600 transition-transform duration-300 group-hover:scale-105">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
                  {f.icon}
                </svg>
              </div>
              <h3 className="font-semibold text-lg text-stone-900 mb-2">{f.title}</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-12 text-center text-white shadow-brand">
          {/* Decorative glow */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-amber-300/25 blur-2xl" />
          </div>
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Ready to transform your tutoring?</h2>
            <p className="text-orange-50/90 mb-8 text-lg max-w-xl mx-auto">
              Join tutors and students building real math understanding with Socra.
            </p>
            <Link href="/auth">
              <button className="bg-white text-orange-600 font-semibold px-8 py-3 rounded-xl shadow-lg shadow-orange-900/10 transition-all duration-200 ease-out hover:bg-orange-50 hover:-translate-y-0.5 active:scale-[0.98]">
                Get Started Free
              </button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="text-center py-8 text-stone-400 text-sm">
        &copy; 2026 Socra
      </footer>
    </div>
  )
}
