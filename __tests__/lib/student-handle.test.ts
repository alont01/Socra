import {
  INTERNAL_STUDENT_EMAIL_DOMAIN,
  displayIdentity,
  isInternalStudentEmail,
} from '@/lib/student-handle'

const synthetic = `student.a1b2c3d4e5f6@${INTERNAL_STUDENT_EMAIL_DOMAIN}`

describe('isInternalStudentEmail', () => {
  it('recognises the synthetic address a parent-created child is given', () => {
    expect(isInternalStudentEmail(synthetic)).toBe(true)
  })

  it('is case-insensitive — the domain can arrive normalized either way', () => {
    expect(isInternalStudentEmail(synthetic.toUpperCase())).toBe(true)
  })

  it('leaves real addresses alone', () => {
    expect(isInternalStudentEmail('maya@example.com')).toBe(false)
    expect(isInternalStudentEmail('tutor@socratutoring.com')).toBe(false)
  })

  it('does not match a lookalike domain that merely contains the suffix', () => {
    expect(isInternalStudentEmail('someone@notstudents.socra.internal.example.com')).toBe(false)
  })

  it('treats a missing address as not synthetic', () => {
    expect(isInternalStudentEmail(null)).toBe(false)
    expect(isInternalStudentEmail(undefined)).toBe(false)
    expect(isInternalStudentEmail('')).toBe(false)
  })
})

describe('displayIdentity', () => {
  it('shows the username for a parent-created child, never the synthetic address', () => {
    const shown = displayIdentity(synthetic, 'maya42')
    expect(shown).toBe('@maya42')
    expect(shown).not.toContain(INTERNAL_STUDENT_EMAIL_DOMAIN)
  })

  it('falls back to a neutral label rather than exposing the address', () => {
    const shown = displayIdentity(synthetic, null)
    expect(shown).not.toContain(INTERNAL_STUDENT_EMAIL_DOMAIN)
    expect(shown).toBe('Signs in with a username')
  })

  it('shows a real email as-is, even when a username also exists', () => {
    expect(displayIdentity('maya@example.com', 'maya42')).toBe('maya@example.com')
  })

  it('renders an absent email as an empty string rather than "null"', () => {
    expect(displayIdentity(null, null)).toBe('')
  })
})
