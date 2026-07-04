import React from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export function Card({ className, children, hover = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white/95 rounded-3xl ring-1 ring-stone-900/5 shadow-soft',
        hover && 'hover:shadow-elevated hover:ring-orange-200/70 hover:-translate-y-0.5 transition-all duration-300 ease-out cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
