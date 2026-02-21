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
          <span>✨</span>
          <span>AI-powered Socratic math tutoring</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-stone-900 mb-6 leading-tight">
          Math clicks when you{' '}
          <span className="text-orange-500">discover</span> it yourself
        </h1>

        <p className="text-xl text-stone-500 max-w-2xl mx-auto mb-10">
          Socra never just gives you the answer. It asks the right questions so
          you build real understanding — and confidence that lasts.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/auth">
            <Button size="lg" className="text-base px-8">
              Start Learning Free →
            </Button>
          </Link>
          <Link href="/auth?role=parent">
            <Button variant="ghost" size="lg" className="text-base">
              I&apos;m a Parent
            </Button>
          </Link>
        </div>

        {/* Demo chat bubble */}
        <div className="mt-16 max-w-lg mx-auto text-left">
          <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6 space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-sm font-bold text-stone-600 shrink-0">S</div>
              <div className="bg-stone-50 rounded-2xl rounded-tl-sm px-4 py-2.5 text-stone-700 text-sm">
                Can you just tell me the answer to x² + 5x + 6 = 0?
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold text-white shrink-0">∑</div>
              <div className="bg-orange-50 rounded-2xl rounded-tl-sm px-4 py-2.5 text-stone-700 text-sm">
                Great question! What two numbers multiply to 6 and add to 5? Try listing factor pairs of 6 first — what do you get?
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-stone-900 text-center mb-12">
          Built for real understanding
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '🧠',
              title: 'Socratic Method',
              desc: 'Every session guides you to the answer through questions — building problem-solving skills that stick.',
            },
            {
              icon: '🎯',
              title: 'Personalized Path',
              desc: 'Your learning plan adapts to your grade, strengths, and goals. No one-size-fits-all curriculum.',
            },
            {
              icon: '📈',
              title: 'Real Progress',
              desc: 'Track sessions, celebrate streaks, and watch your confidence grow week by week.',
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
          <h2 className="text-3xl font-bold mb-4">Ready to understand math — really?</h2>
          <p className="text-orange-100 mb-8 text-lg">Join students building genuine math skills with Socra.</p>
          <Link href="/auth">
            <button className="bg-white text-orange-600 font-semibold px-8 py-3 rounded-xl hover:bg-orange-50 transition-colors">
              Get Started Free →
            </button>
          </Link>
        </div>
      </section>

      <footer className="text-center py-8 text-stone-400 text-sm">
        © 2026 Socra. Built with ♥ for curious students.
      </footer>
    </div>
  )
}
