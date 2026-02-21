import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Card } from '@/components/ui/Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card><p>Card content</p></Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies base styles always', () => {
    const { container } = render(<Card>Base</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('bg-white')
    expect(card.className).toContain('border-orange-100')
    expect(card.className).toContain('rounded-2xl')
  })

  it('applies hover styles when hover=true', () => {
    const { container } = render(<Card hover>Hoverable</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('hover:shadow-md')
    expect(card.className).toContain('hover:border-orange-200')
    expect(card.className).toContain('cursor-pointer')
  })

  it('does not apply hover styles when hover is false by default', () => {
    const { container } = render(<Card>Not hoverable</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).not.toContain('hover:shadow-md')
    expect(card.className).not.toContain('cursor-pointer')
  })

  it('accepts onClick handler', () => {
    const handleClick = jest.fn()
    const { container } = render(<Card onClick={handleClick}>Clickable</Card>)
    const card = container.firstChild as HTMLElement
    fireEvent.click(card)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('accepts additional className', () => {
    const { container } = render(<Card className="p-8">Padded</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('p-8')
  })

  it('renders as a div element', () => {
    const { container } = render(<Card>Div Card</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.tagName).toBe('DIV')
  })
})
