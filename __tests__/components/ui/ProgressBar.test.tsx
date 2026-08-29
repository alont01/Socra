import { render, screen, act } from '@testing-library/react'
import { ProgressBar } from '@/components/ui/ProgressBar'

const width = () => {
  const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement
  return parseInt(fill.style.width, 10)
}

describe('ProgressBar', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('renders nothing until it is activated', () => {
    render(<ProgressBar active={false} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('advances while active', () => {
    render(<ProgressBar active estimatedMs={10000} />)
    act(() => { jest.advanceTimersByTime(2000) })
    const early = width()
    act(() => { jest.advanceTimersByTime(3000) })
    expect(width()).toBeGreaterThan(early)
  })

  it('decelerates rather than running out', () => {
    render(<ProgressBar active estimatedMs={10000} />)
    act(() => { jest.advanceTimersByTime(2000) })
    const first = width()
    act(() => { jest.advanceTimersByTime(2000) })
    const second = width() - first
    act(() => { jest.advanceTimersByTime(2000) })
    const third = width() - first - second
    expect(third).toBeLessThan(second)
  })

  it('never reaches 100% on its own, however long the work runs', () => {
    render(<ProgressBar active estimatedMs={5000} />)
    act(() => { jest.advanceTimersByTime(600_000) })
    expect(width()).toBeLessThan(100)
  })

  it('completes and disappears once the work lands', () => {
    const { rerender } = render(<ProgressBar active estimatedMs={10000} />)
    act(() => { jest.advanceTimersByTime(2000) })
    rerender(<ProgressBar active={false} estimatedMs={10000} />)
    expect(width()).toBe(100)
    act(() => { jest.advanceTimersByTime(500) })
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('labels itself for screen readers', () => {
    render(<ProgressBar active label="Writing the next problem…" />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-label', 'Writing the next problem…')
    expect(bar).toHaveAttribute('aria-busy', 'true')
  })
})
