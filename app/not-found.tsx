import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center px-4 text-center">
      <div aria-hidden className="grid place-items-center h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-white text-2xl font-bold shadow-brand mb-6">
        ∑
      </div>
      <p className="text-sm font-semibold uppercase tracking-widest text-orange-500 mb-2">404</p>
      <h1 className="text-3xl font-bold tracking-tight text-stone-900 mb-2">Page not found</h1>
      <p className="text-stone-500 max-w-sm mb-6">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="inline-flex bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl shadow-brand hover:bg-orange-600 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
      >
        Go home
      </Link>
    </div>
  )
}
