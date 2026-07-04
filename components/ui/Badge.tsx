import React from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'orange' | 'amber' | 'green' | 'stone'
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-stone-100 text-stone-700 ring-stone-200/70',
    orange: 'bg-orange-100 text-orange-700 ring-orange-200/70',
    amber: 'bg-amber-100 text-amber-700 ring-amber-200/70',
    green: 'bg-green-100 text-green-700 ring-green-200/70',
    stone: 'bg-stone-200 text-stone-600 ring-stone-300/70',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
