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
    desc: 'Tutors and students meet one-on-one over video. Tutors take notes right in the session.',
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
    desc: 'After each call, AI reads the transcript and surfaces strengths, gaps, and coaching tips.',
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
    desc: 'Every gap becomes a personalized practice set, with mastery tracked automatically over time.',
    icon: (
      <path
        d="M4 19V5m0 14h16M7 15l3.5-3.5 3 3L20 8m0 0h-4m4 0v4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

const steps = [
  { n: '01', title: 'Run the session', desc: 'Meet over video and teach. Socra records the transcript in the background.' },
  { n: '02', title: 'AI analyzes it', desc: 'The moment you end the call, Claude summarizes concepts, strengths, and gaps.' },
  { n: '03', title: 'Practice + progress', desc: 'Students get targeted practice sets while mastery updates session over session.' },
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
        {/* Ambient background: mesh blobs + dot grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-orange-300/30 blur-3xl animate-float-slow" />
          <div className="absolute top-0 right-0 h-[28rem] w-[28rem] rounded-full bg-amber-200/40 blur-3xl animate-float-slow [animation-delay:-4s]" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-orange-200/30 blur-3xl animate-float-slow [animation-delay:-6s]" />
          <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(120,113,108,0.18)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur ring-1 ring-orange-200/70 text-orange-700 px-4 py-1.5 rounded-full text-sm font-medium mb-7 shadow-soft animate-fade-in-up">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
              </span>
              Live tutoring + AI-powered insights
            </div>

            <h1 className="text-5xl md:text-6xl xl:text-7xl font-bold tracking-tight text-stone-900 mb-6 leading-[1.02] animate-fade-in-up [animation-delay:60ms]">
              Tutoring that gets{' '}
              <span className="relative whitespace-nowrap">
                <span className="text-gradient-brand">smarter</span>
                <svg aria-hidden viewBox="0 0 300 12" className="absolute -bottom-2 left-0 w-full text-orange-300/70" preserveAspectRatio="none">
                  <path d="M2 8c60-6 236-6 296 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>{' '}
              every session
            </h1>

            <p className="text-lg md:text-xl text-stone-500 max-w-xl mx-auto lg:mx-0 mb-9 leading-relaxed animate-fade-in-up [animation-delay:120ms]">
              Socra pairs live tutor–student video sessions with AI analysis. After every session:
              instant summaries, targeted practice, and progress that compounds — automatically.
            </p>

            <div className="flex items-center justify-center lg:justify-start gap-3 flex-wrap animate-fade-in-up [animation-delay:180ms]">
              <Link href="/get-started">
                <Button size="lg" className="text-base px-8">
                  Book a Free Consultation
                </Button>
              </Link>
              <Link href="/auth">
                <Button size="lg" variant="ghost" className="text-base px-6">
                  Log In
                </Button>
              </Link>
            </div>

            <p className="mt-4 text-sm text-stone-400 animate-fade-in-up [animation-delay:220ms]">
              No credit card required · Set up in minutes
            </p>
          </div>

          {/* Product preview */}
          <div className="relative animate-fade-in-up [animation-delay:160ms]">
            {/* Glow behind card */}
            <div aria-hidden className="absolute -inset-6 bg-gradient-to-tr from-orange-400/20 via-amber-300/20 to-transparent blur-2xl rounded-[2.5rem]" />

            {/* Peeking back card */}
            <div className="absolute -right-3 -top-5 hidden sm:block w-56 rounded-2xl bg-white/80 backdrop-blur ring-1 ring-stone-900/5 shadow-soft p-4 rotate-6">
              <div className="flex items-center gap-2 text-xs font-medium text-stone-500 mb-3">
                <span className="grid place-items-center h-6 w-6 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white text-[11px] font-bold">∑</span>
                Practice set ready
              </div>
              <div className="space-y-2">
                <div className="h-2 rounded-full bg-orange-100" />
                <div className="h-2 rounded-full bg-orange-100 w-4/5" />
                <div className="h-2 rounded-full bg-stone-100 w-3/5" />
              </div>
            </div>

            {/* Main insight card */}
            <div className="relative rounded-[1.75rem] bg-white/90 backdrop-blur ring-1 ring-stone-900/5 shadow-elevated p-6 animate-float-slow">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-base font-bold shadow-brand">∑</span>
                  <div>
                    <p className="text-sm font-semibold text-stone-900 leading-tight">Session Insight</p>
                    <p className="text-xs text-stone-400 leading-tight">Algebra · today</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 bg-orange-100 ring-1 ring-inset ring-orange-200/70 px-2 py-1 rounded-full">
                  AI
                </span>
              </div>

              {/* Mastery bars */}
              <div className="space-y-3 mb-5">
                {[
                  { label: 'Linear equations', pct: 86 },
                  { label: 'Factoring', pct: 64 },
                  { label: 'Word problems', pct: 42 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs text-stone-500 mb-1">
                      <span>{row.label}</span>
                      <span className="tabular-nums font-medium text-stone-700">{row.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600"
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 ring-1 ring-inset ring-green-200/70">Strength: substitution</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70">Gap: factoring</span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-orange-50 ring-1 ring-inset ring-orange-100 px-4 py-3">
                <span className="text-sm font-medium text-stone-700">5 practice problems generated</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-orange-500">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust / stats */}
      <section className="relative max-w-6xl mx-auto px-4 -mt-6 mb-8">
        <div className="grid grid-cols-3 gap-3 sm:gap-6 rounded-3xl bg-white/70 backdrop-blur ring-1 ring-stone-900/5 shadow-soft p-6 text-center">
          {[
            { stat: '100%', label: 'Sessions AI-analyzed' },
            { stat: '0', label: 'Manual note-taking after class' },
            { stat: '∞', label: 'Practice, tailored to each student' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-gradient-brand">{s.stat}</p>
              <p className="text-xs sm:text-sm text-stone-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-500 mb-3">Why Socra</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-stone-900">
            Everything after &ldquo;class dismissed&rdquo;, handled
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative overflow-hidden bg-white/95 rounded-3xl ring-1 ring-stone-900/5 shadow-soft p-7 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-elevated hover:ring-orange-200/70 animate-fade-in-up"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div aria-hidden className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="mb-5 grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-100 text-orange-600 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
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

      {/* How it works */}
      <section className="relative max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-stone-900 text-center mb-14">
          From session to mastery, in three steps
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="relative rounded-3xl bg-white/80 backdrop-blur ring-1 ring-stone-900/5 shadow-soft p-7 animate-fade-in-up"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="text-5xl font-bold text-orange-200 leading-none">{s.n}</span>
              <h3 className="font-semibold text-lg text-stone-900 mt-3 mb-2">{s.title}</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-12 md:p-16 text-center text-white shadow-brand">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-16 -right-10 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-amber-300/30 blur-2xl" />
            <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          </div>
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Ready to transform your tutoring?</h2>
            <p className="text-orange-50/90 mb-8 text-lg max-w-xl mx-auto">
              Join tutors and students building real math understanding with Socra.
            </p>
            <Link href="/get-started">
              <button className="bg-white text-orange-600 font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-orange-900/10 transition-all duration-200 ease-out hover:bg-orange-50 hover:-translate-y-0.5 active:scale-[0.98]">
                Book a Free Consultation
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
