'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center px-4 text-center">
      <div aria-hidden className="grid place-items-center h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-2xl font-bold shadow-brand mb-6">
        ∑
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-stone-900 mb-2">Something went wrong</h1>
      <p className="text-stone-500 max-w-sm mb-6">
        An unexpected error occurred. You can try again, or head back home.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl shadow-brand hover:bg-orange-600 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex text-stone-600 font-semibold px-6 py-3 rounded-xl hover:bg-orange-500/10 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
