import React from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export function Card({ className, children, hover = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-orange-100 rounded-2xl shadow-sm',
        hover && 'hover:shadow-md hover:border-orange-200 transition-all duration-200 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
