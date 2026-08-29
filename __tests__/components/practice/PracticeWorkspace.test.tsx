import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PracticeWorkspace } from '@/components/practice/PracticeWorkspace'

jest.mock('@/hooks/useToast', () => ({ useToast: () => ({ toast: jest.fn() }) }))

const problems = [
  { id: 'p1', question: 'Factor x^2-9', hint: 'Difference of squares', difficulty: 'easy', topic: 'factoring' },
  { id: 'p2', question: 'Solve 3x+5=20', hint: '', difficulty: 'easy', topic: 'algebra' },
]

const setup = (existingAttempts: { problemIndex: number; studentAnswer: string; correct: boolean | null }[] = []) =>
  render(<PracticeWorkspace practiceSetId="set1" problems={problems} existingAttempts={existingAttempts} />)

const mockFetch = (status: number, body: unknown) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch
}

afterEach(() => { jest.restoreAllMocks() })

describe('PracticeWorkspace', () => {
  it('shows a correct answer as correct', async () => {
    mockFetch(200, { correct: true, attempt: { studentAnswer: '(x-3)(x+3)' } })
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/your answer/i), '(x-3)(x+3)')
    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/✓ Correct!/)).toBeInTheDocument()
  })

  it('reveals the correct answer when wrong', async () => {
    mockFetch(200, { correct: false, correctAnswer: '(x-3)(x+3)' })
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/your answer/i), 'nope')
    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/not quite/i)).toBeInTheDocument()
    expect(screen.getByText(/correct answer:/i)).toBeInTheDocument()
  })

  // A problem assigned without an answer key can't be graded. Marking it wrong
  // told the student they were incorrect whatever they typed.
  it('renders an ungraded answer as recorded, not wrong', async () => {
    mockFetch(200, { correct: null, ungraded: true, attempt: { studentAnswer: '5' } })
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/your answer/i), '5')
    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/answer recorded/i)).toBeInTheDocument()
    expect(screen.queryByText(/not quite/i)).not.toBeInTheDocument()
    expect(screen.getByText(/doesn't have an answer key/i)).toBeInTheDocument()
  })

  // The answer DID land; "failed to submit" was both wrong and unfixable,
  // because retrying just conflicts again.
  it('reconciles a 409 to the stored result instead of showing an error', async () => {
    mockFetch(409, {
      error: 'Already answered this problem',
      correct: true,
      attempt: { studentAnswer: '(x-3)(x+3)', correct: true },
    })
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText(/your answer/i), '(x-3)(x+3)')
    await user.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/✓ Correct!/)).toBeInTheDocument()
  })

  it('restores previously answered problems, including ungraded ones', () => {
    setup([
      { problemIndex: 0, studentAnswer: '(x-3)(x+3)', correct: true },
      { problemIndex: 1, studentAnswer: '5', correct: null },
    ])
    // Both count as answered — an ungraded attempt used to be dropped entirely,
    // so the student could resubmit it and hit a confusing conflict.
    expect(screen.getByText(/2 of 2 answered/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /problem 1, correct/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^problem 2, answered$/i })).toBeInTheDocument()
  })

  it('scores out of what was actually graded', () => {
    setup([
      { problemIndex: 0, studentAnswer: 'x', correct: true },
      { problemIndex: 1, studentAnswer: 'y', correct: null },
    ])
    // 1 correct of 1 graded — the ungraded problem must not count against them.
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })

  it('starts on the first unanswered problem', () => {
    setup([{ problemIndex: 0, studentAnswer: '(x-3)(x+3)', correct: true }])
    expect(screen.getByText(/Solve 3x\+5=20/)).toBeInTheDocument()
  })
})
