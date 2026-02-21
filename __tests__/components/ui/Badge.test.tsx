import React from 'react'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/Badge'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('applies default variant styles when no variant provided', () => {
    render(<Badge>Default</Badge>)
    const badge = screen.getByText('Default')
    expect(badge.className).toContain('bg-stone-100')
    expect(badge.className).toContain('text-stone-700')
  })

  it('applies orange variant styles', () => {
    render(<Badge variant="orange">Orange</Badge>)
    const badge = screen.getByText('Orange')
    expect(badge.className).toContain('bg-orange-100')
    expect(badge.className).toContain('text-orange-700')
  })

  it('applies amber variant styles', () => {
    render(<Badge variant="amber">Amber</Badge>)
    const badge = screen.getByText('Amber')
    expect(badge.className).toContain('bg-amber-100')
    expect(badge.className).toContain('text-amber-700')
  })

  it('applies green variant styles', () => {
    render(<Badge variant="green">Green</Badge>)
    const badge = screen.getByText('Green')
    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-700')
  })

  it('applies stone variant styles', () => {
    render(<Badge variant="stone">Stone</Badge>)
    const badge = screen.getByText('Stone')
    expect(badge.className).toContain('bg-stone-200')
    expect(badge.className).toContain('text-stone-600')
  })

  it('accepts additional className', () => {
    render(<Badge className="my-custom-class">Custom</Badge>)
    const badge = screen.getByText('Custom')
    expect(badge.className).toContain('my-custom-class')
  })

  it('renders as a span element', () => {
    render(<Badge>Span Badge</Badge>)
    const badge = screen.getByText('Span Badge')
    expect(badge.tagName).toBe('SPAN')
  })
})
