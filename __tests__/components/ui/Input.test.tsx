import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from '@/components/ui/Input'

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text here" />)
    expect(screen.getByPlaceholderText('Enter text here')).toBeInTheDocument()
  })

  it('renders with label when provided', () => {
    render(<Input label="Email address" />)
    expect(screen.getByText('Email address')).toBeInTheDocument()
  })

  it('programmatically associates the label with its input', () => {
    // Previously the <label> matched the input only by adjacent text, with no
    // htmlFor/id — assistive tech and getByLabelText() couldn't connect them.
    render(<Input label="Email address" />)
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
  })

  it('keeps each instance uniquely associated when several inputs share a label prop', () => {
    render(
      <>
        <Input label="Password" />
        <Input label="Confirm Password" />
      </>
    )
    expect(screen.getByLabelText('Password')).not.toBe(screen.getByLabelText('Confirm Password'))
  })

  it('honors an explicit id instead of generating one', () => {
    render(<Input label="Email address" id="custom-email-id" />)
    expect(screen.getByLabelText('Email address')).toHaveAttribute('id', 'custom-email-id')
  })

  it('does not render label element when label prop is not provided', () => {
    render(<Input placeholder="no label" />)
    expect(screen.queryByRole('label')).not.toBeInTheDocument()
    // The label text should not appear anywhere
    const labels = document.querySelectorAll('label')
    expect(labels.length).toBe(0)
  })

  it('shows error message when error prop provided', () => {
    render(<Input error="This field is required" />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('applies error styling to input when error prop provided', () => {
    render(<Input error="Invalid input" />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('ring-red-400')
    expect(input.className).toContain('focus:ring-red-400')
  })

  it('does not apply error styling when no error', () => {
    render(<Input placeholder="normal input" />)
    const input = screen.getByRole('textbox')
    expect(input.className).not.toContain('ring-red-400')
  })

  it('calls onChange handler when value changes', () => {
    const handleChange = jest.fn()
    render(<Input onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'hello' } })
    expect(handleChange).toHaveBeenCalledTimes(1)
  })

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLInputElement>()
    render(<Input ref={ref} placeholder="ref test" />)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('INPUT')
  })

  it('passes through additional html attributes', () => {
    render(<Input type="email" placeholder="email@example.com" required />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toBeRequired()
  })
})
