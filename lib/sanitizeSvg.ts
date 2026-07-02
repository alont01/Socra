// Client-side SVG sanitizer (no dependencies). AI-generated geometry figures are
// rendered as inline SVG; this strips anything that could execute script so the
// markup is safe to inject. Uses the browser DOMParser, so it only runs client-side.

const ALLOWED_TAGS = new Set([
  'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse',
  'text', 'tspan', 'defs', 'marker', 'lineargradient', 'radialgradient', 'stop',
  'title', 'desc',
])

const ALLOWED_ATTRS = new Set([
  'viewbox', 'xmlns', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'dx', 'dy',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline',
  'class', 'offset', 'stop-color', 'stop-opacity', 'gradientunits',
  'marker-end', 'marker-start', 'markerwidth', 'markerheight', 'refx', 'refy',
  'orient', 'id', 'preserveaspectratio',
])

function cleanElement(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
      child.remove()
      continue
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase()
      // Drop event handlers, link/href targets, and anything not whitelisted.
      if (name.startsWith('on') || name === 'href' || name === 'xlink:href' || !ALLOWED_ATTRS.has(name)) {
        child.removeAttribute(attr.name)
      }
    }
    cleanElement(child)
  }
}

/**
 * Returns sanitized SVG markup, or null if the input is unsafe/unparseable or
 * called during SSR. Wraps bare inner markup in an <svg> if needed.
 */
export function sanitizeSvg(input: string): string | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return null

  let src = input.trim()
  if (!/^<svg[\s>]/i.test(src)) {
    src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">${src}</svg>`
  }

  try {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml')
    if (doc.querySelector('parsererror')) return null

    const svg = doc.documentElement
    if (!svg || svg.tagName.toLowerCase() !== 'svg') return null

    // Sanitize the root's own attributes, then walk its subtree.
    for (const attr of Array.from(svg.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'href' || name === 'xlink:href' || !ALLOWED_ATTRS.has(name)) {
        svg.removeAttribute(attr.name)
      }
    }
    cleanElement(svg)

    // Normalize sizing. AI output often uses width/height="100%" or omits them,
    // which collapses to zero height inside a flex container. If a viewBox is
    // present, pin width/height to its dimensions so CSS can scale the figure
    // responsively while preserving aspect ratio.
    const viewBox = Array.from(svg.attributes).find((a) => a.name.toLowerCase() === 'viewbox')?.value
    const dims = viewBox?.trim().split(/[\s,]+/).map(Number)
    if (dims && dims.length === 4 && dims.every(Number.isFinite) && dims[2] > 0 && dims[3] > 0) {
      svg.setAttribute('width', String(dims[2]))
      svg.setAttribute('height', String(dims[3]))
    } else {
      // No usable viewBox — drop percentage dimensions that would collapse.
      for (const dim of ['width', 'height']) {
        const v = svg.getAttribute(dim)
        if (v && v.includes('%')) svg.removeAttribute(dim)
      }
    }

    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return new XMLSerializer().serializeToString(svg)
  } catch {
    return null
  }
}
