import React from 'react'
import { render, screen } from '@testing-library/react'
import { StepIndicator } from '@/components/onboarding/StepIndicator'

describe('StepIndicator', () => {
  const defaultProps = {
    current: 1,
    total: 3,
    labels: ['Step 1', 'Step 2', 'Step 3'],
  }

  it('renders correct number of step circles', () => {
    render(<StepIndicator {...defaultProps} />)
    // Step circles show either checkmark or step number
    // Steps before current show checkmark, current and future show numbers
    // With current=1, total=3: step 0 is completed (checkmark), step 1 is current, step 2 is future
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders the correct total number of step circle divs', () => {
    const { container } = render(<StepIndicator {...defaultProps} />)
    // Each step has a flex items-center container; the inner circle div has font-bold
    const circles = container.querySelectorAll('div[class*="w-8 h-8 rounded-full"]')
    expect(circles.length).toBe(3)
  })

  it('completed steps show checkmark', () => {
    // current=2 means steps 0 and 1 are completed
    render(<StepIndicator current={2} total={3} labels={['A', 'B', 'C']} />)
    const checkmarks = screen.getAllByText('✓')
    expect(checkmarks.length).toBe(2)
  })

  it('current step has ring styling', () => {
    const { container } = render(<StepIndicator current={1} total={3} labels={['A', 'B', 'C']} />)
    const circles = container.querySelectorAll('div[class*="w-8 h-8 rounded-full"]')
    // Index 1 is current (i === current), should have ring-4 ring-orange-200
    expect(circles[1].className).toContain('ring-4')
    expect(circles[1].className).toContain('ring-orange-200')
  })

  it('completed steps have orange background without ring', () => {
    const { container } = render(<StepIndicator current={1} total={3} labels={['A', 'B', 'C']} />)
    const circles = container.querySelectorAll('div[class*="w-8 h-8 rounded-full"]')
    // Index 0 is completed (i < current)
    expect(circles[0].className).toContain('bg-orange-500')
    expect(circles[0].className).not.toContain('ring-4')
  })

  it('future steps have muted styling', () => {
    const { container } = render(<StepIndicator current={0} total={3} labels={['A', 'B', 'C']} />)
    const circles = container.querySelectorAll('div[class*="w-8 h-8 rounded-full"]')
    // Index 1 and 2 are future steps
    expect(circles[1].className).toContain('bg-stone-200')
    expect(circles[1].className).toContain('text-stone-500')
    expect(circles[2].className).toContain('bg-stone-200')
    expect(circles[2].className).toContain('text-stone-500')
  })

  it('connectors between steps exist for all but the last step', () => {
    const { container } = render(<StepIndicator current={1} total={3} labels={['A', 'B', 'C']} />)
    // Connectors are divs with w-8 h-0.5
    const connectors = container.querySelectorAll('div[class*="w-8 h-0.5"]')
    // total - 1 connectors (between steps)
    expect(connectors.length).toBe(2)
  })

  it('completed connectors have orange color', () => {
    const { container } = render(<StepIndicator current={2} total={3} labels={['A', 'B', 'C']} />)
    const connectors = container.querySelectorAll('div[class*="w-8 h-0.5"]')
    // With current=2, connectors at i=0 and i=1 are both completed (i < current)
    expect(connectors[0].className).toContain('bg-orange-500')
    expect(connectors[1].className).toContain('bg-orange-500')
  })

  it('future connectors have muted color', () => {
    const { container } = render(<StepIndicator current={0} total={3} labels={['A', 'B', 'C']} />)
    const connectors = container.querySelectorAll('div[class*="w-8 h-0.5"]')
    // With current=0, no connectors are completed (i < current=0 is false for all)
    expect(connectors[0].className).toContain('bg-stone-200')
    expect(connectors[1].className).toContain('bg-stone-200')
  })

  it('renders step numbers for future and current steps', () => {
    render(<StepIndicator current={0} total={3} labels={['A', 'B', 'C']} />)
    // current=0: step 0 shows '1' (current), steps 1,2 show '2','3' (future)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
