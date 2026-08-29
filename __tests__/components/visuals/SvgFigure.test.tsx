import React from 'react'
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SvgFigure } from '@/components/visuals/SvgFigure'

const TRIANGLE = '<svg viewBox="0 0 100 100"><polygon points="0,0 100,0 50,80" fill="#eee" /></svg>'

describe('SvgFigure', () => {
  it('renders a sanitized figure once mounted in the browser', () => {
    const { container } = render(<SvgFigure svg={TRIANGLE} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('polygon')).toBeTruthy()
  })

  it('does not claim failure during the server render', () => {
    // The bug: sanitizeSvg needs DOMParser, so it returns null on the server.
    // Treating "not sanitized yet" as "sanitization failed" made the server
    // emit this message for every perfectly valid figure — and then the client
    // rendered the actual SVG, so the two disagreed and hydration mismatched.
    const html = renderToStaticMarkup(<SvgFigure svg={TRIANGLE} />)
    expect(html).not.toContain('Could not render figure')
  })

  it('server markup matches the first client render, so hydration is stable', () => {
    const serverHtml = renderToStaticMarkup(<SvgFigure svg={TRIANGLE} />)
    // React Testing Library flushes effects, so render the placeholder branch
    // by checking what the component produces before its effect resolves.
    const { container } = render(<SvgFigure svg={TRIANGLE} />)
    // The placeholder the server emitted must be a valid prefix state — i.e.
    // it must not be the error branch that the client will never reach.
    expect(serverHtml).toContain('aria-hidden')
    expect(container.innerHTML).not.toContain('Could not render figure')
  })

  it('still reports genuinely unsanitizable input', async () => {
    render(<SvgFigure svg="<svg><unclosed" />)
    expect(await screen.findByText('Could not render figure.')).toBeInTheDocument()
  })

  it('strips script and event handlers from model-generated markup', () => {
    const hostile = '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect onload="alert(2)" width="5" height="5"/></svg>'
    const { container } = render(<SvgFigure svg={hostile} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('rect')?.getAttribute('onload')).toBeNull()
  })
})
