import { cn } from '@/lib/utils'

/**
 * Shimmering placeholder for loading states. Decorative — hidden from a11y tree.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-stone-200/70', className)} />
}
