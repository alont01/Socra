import {
  loginSchema,
  signupSchema,
  addChildSchema,
  chatSchema,
  createSessionSchema,
  practiceAttemptSchema,
  parseBody,
} from '@/lib/validations'

describe('validation schemas', () => {
  describe('loginSchema', () => {
    it('accepts valid input', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com', password: 'password123' })
      expect(result.success).toBe(true)
    })

    it('accepts a username as the identifier (parent-created student accounts)', () => {
      const result = loginSchema.safeParse({ email: 'maya42', password: 'password123' })
      expect(result.success).toBe(true)
    })

    it('rejects an empty identifier', () => {
      const result = loginSchema.safeParse({ email: '', password: 'password123' })
      expect(result.success).toBe(false)
    })

    it('rejects missing password', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com' })
      expect(result.success).toBe(false)
    })

    it('rejects empty object', () => {
      const result = loginSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe('addChildSchema', () => {
    const valid = { name: 'Maya', gradeLevel: '9th', goals: '', username: 'maya42', password: 'secret6' }

    it('accepts a valid child', () => {
      expect(addChildSchema.safeParse(valid).success).toBe(true)
    })

    it('requires a name', () => {
      expect(addChildSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
    })

    it('rejects a username under 3 chars', () => {
      expect(addChildSchema.safeParse({ ...valid, username: 'ab' }).success).toBe(false)
    })

    it('rejects a username that does not start with a letter', () => {
      expect(addChildSchema.safeParse({ ...valid, username: '1maya' }).success).toBe(false)
    })

    it('rejects a username with spaces/@', () => {
      expect(addChildSchema.safeParse({ ...valid, username: 'ma ya' }).success).toBe(false)
      expect(addChildSchema.safeParse({ ...valid, username: 'a@b' }).success).toBe(false)
    })

    it('rejects a password under 6 chars', () => {
      expect(addChildSchema.safeParse({ ...valid, password: '12345' }).success).toBe(false)
    })
  })

  describe('signupSchema', () => {
    const valid = { email: 'test@example.com', password: 'password123', role: 'STUDENT', name: 'Test' }

    it('accepts valid student signup', () => {
      const result = signupSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('accepts PARENT role', () => {
      const result = signupSchema.safeParse({ ...valid, role: 'PARENT' })
      expect(result.success).toBe(true)
    })

    it('rejects TUTOR role at public signup (tutors are invite-only)', () => {
      const result = signupSchema.safeParse({ ...valid, role: 'TUTOR' })
      expect(result.success).toBe(false)
    })

    it('rejects invalid role', () => {
      const result = signupSchema.safeParse({ ...valid, role: 'ADMIN' })
      expect(result.success).toBe(false)
    })

    it('rejects short password', () => {
      const result = signupSchema.safeParse({ ...valid, password: '123' })
      expect(result.success).toBe(false)
    })

    it('rejects missing name', () => {
      const result = signupSchema.safeParse({ email: 'a@b.com', password: 'password123', role: 'STUDENT' })
      expect(result.success).toBe(false)
    })
  })

  describe('chatSchema', () => {
    it('accepts valid messages', () => {
      const result = chatSchema.safeParse({
        messages: [{ role: 'user', content: 'Hello' }],
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty messages array', () => {
      const result = chatSchema.safeParse({ messages: [] })
      expect(result.success).toBe(false)
    })

    it('rejects invalid role in message', () => {
      const result = chatSchema.safeParse({
        messages: [{ role: 'system', content: 'Hello' }],
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty content', () => {
      const result = chatSchema.safeParse({
        messages: [{ role: 'user', content: '' }],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('createSessionSchema', () => {
    it('accepts valid session', () => {
      const result = createSessionSchema.safeParse({ studentId: 'abc', topic: 'Algebra' })
      expect(result.success).toBe(true)
    })

    it('rejects missing topic', () => {
      const result = createSessionSchema.safeParse({ studentId: 'abc' })
      expect(result.success).toBe(false)
    })

    it('accepts optional scheduledAt', () => {
      const result = createSessionSchema.safeParse({
        studentId: 'abc',
        topic: 'Algebra',
        scheduledAt: '2026-03-20T10:00:00Z',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('practiceAttemptSchema', () => {
    it('accepts valid attempt', () => {
      const result = practiceAttemptSchema.safeParse({ problemIndex: 0, studentAnswer: '42' })
      expect(result.success).toBe(true)
    })

    it('rejects negative index', () => {
      const result = practiceAttemptSchema.safeParse({ problemIndex: -1, studentAnswer: '42' })
      expect(result.success).toBe(false)
    })

    it('rejects non-integer index', () => {
      const result = practiceAttemptSchema.safeParse({ problemIndex: 1.5, studentAnswer: '42' })
      expect(result.success).toBe(false)
    })

    it('rejects empty answer', () => {
      const result = practiceAttemptSchema.safeParse({ problemIndex: 0, studentAnswer: '' })
      expect(result.success).toBe(false)
    })
  })
})

describe('parseBody', () => {
  it('returns data for valid input', () => {
    const result = parseBody(loginSchema, { email: 'a@b.com', password: '123' })
    expect('data' in result).toBe(true)
    if ('data' in result) {
      expect(result.data.email).toBe('a@b.com')
    }
  })

  it('returns error string for invalid input', () => {
    const result = parseBody(loginSchema, { email: 'bad' })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('returns first error message with field path', () => {
    const result = parseBody(signupSchema, { email: 'bad', password: 'x', role: 'X', name: '' })
    expect('error' in result).toBe(true)
  })
})
