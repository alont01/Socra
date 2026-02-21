import React from 'react'
import { render } from '@testing-library/react'
import { LoadingDots } from '@/components/ui/LoadingDots'

describe('LoadingDots', () => {
  it('renders 3 dot spans', () => {
    const { container } = render(<LoadingDots />)
    // The outer span plus 3 inner dot spans
    const innerSpans = container.querySelectorAll('span > span')
    expect(innerSpans.length).toBe(3)
  })

  it('all dots have animate-bounce class', () => {
    const { container } = render(<LoadingDots />)
    const dots = container.querySelectorAll('span > span')
    dots.forEach((dot) => {
      expect(dot.className).toContain('animate-bounce')
    })
  })

  it('all dots have orange color class', () => {
    const { container } = render(<LoadingDots />)
    const dots = container.querySelectorAll('span > span')
    dots.forEach((dot) => {
      expect(dot.className).toContain('bg-orange-400')
    })
  })

  it('all dots are rounded (full)', () => {
    const { container } = render(<LoadingDots />)
    const dots = container.querySelectorAll('span > span')
    dots.forEach((dot) => {
      expect(dot.className).toContain('rounded-full')
    })
  })

  it('renders within a span element', () => {
    const { container } = render(<LoadingDots />)
    const outerSpan = container.firstChild as HTMLElement
    expect(outerSpan.tagName).toBe('SPAN')
  })

  it('first two dots have animation-delay classes', () => {
    const { container } = render(<LoadingDots />)
    const dots = container.querySelectorAll('span > span')
    // First dot has -0.3s delay, second has -0.15s delay
    expect(dots[0].className).toContain('[animation-delay:-0.3s]')
    expect(dots[1].className).toContain('[animation-delay:-0.15s]')
  })
})
