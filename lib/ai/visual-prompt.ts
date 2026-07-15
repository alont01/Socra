/**
 * Shared prompt instructions that teach Claude to emit inline visuals which the
 * `RichContent` renderer understands: LaTeX math, ```plot function graphs, and
 * ```geometry / ```svg figures. Reused across the student chat, practice-set
 * generation, and live-practice generation so formatting stays consistent.
 */

/**
 * For free-form (non-JSON) responses such as the streamed student chat.
 */
export const VISUAL_PROMPT = `Format all math with LaTeX: inline as $...$ and block equations as $$...$$.

When a visual genuinely helps understanding, include one (only when it aids learning):

To graph functions, emit a fenced block tagged "plot" containing JSON. PREFER giving each series an "expr" (a formula in x) — it renders exact, smooth, and interactive — instead of listing points:
\`\`\`plot
{"title":"y = x^2","xLabel":"x","yLabel":"y","xDomain":[-4,4],"series":[{"label":"y = x^2","color":"#f97316","expr":"x^2"}],"points":[{"x":2,"y":4,"label":"(2, 4)"}]}
\`\`\`
- "expr" supports + - * / ^, parentheses, implicit multiplication (2x, 3(x+1)), constants pi and e, and functions sin cos tan asin acos atan sqrt cbrt abs exp ln log(base 10) log2 floor ceil round min max pow. Example: "0.5*x^2 - 3*x + 1", "sin(x)".
- To make a graph interactive, reference parameters in the expr and declare them in "params" — each renders as a slider that re-plots live:
{"xDomain":[-5,5],"series":[{"label":"y = a x^2","expr":"a*x^2"}],"params":[{"name":"a","min":-3,"max":3,"value":1,"step":0.1}]}
- "series" draw connected lines; "points" are individual labeled dots. xDomain (and optional yDomain) set the view. Only fall back to an explicit "points":[[x,y],...] array if a curve can't be written as a formula.

To draw geometry (triangles, angles, number lines, coordinate figures), emit a fenced block tagged "geometry" containing a self-contained <svg> with a viewBox, using only basic shapes (line, polyline, polygon, rect, circle, ellipse, path, text) and <text> labels. No scripts, styles, or external images.

Keep text outside the blocks concise.`

/**
 * For responses where the problem text lives inside a JSON string value (the
 * practice-set and live-problem generators). Emphasizes JSON escaping so the
 * output stays parseable.
 */
export const VISUAL_PROMPT_JSON = `Write math with LaTeX (inline $...$, block $$...$$). These fields sit inside a JSON string, so escape every backslash as \\\\ (e.g. "$\\\\frac{1}{2}$") and every newline as \\n so the JSON stays valid.

When a graph or diagram genuinely helps a problem, embed one directly inside the "question" string (escape its newlines as \\n too):
- Function graphs: a fenced \`\`\`plot block containing JSON. Prefer an "expr" formula in x per series (e.g. {"xDomain":[-4,4],"series":[{"label":"y = x^2","expr":"x^2"}]}) — it renders exact and smooth. expr supports + - * / ^, implicit multiplication, pi, e, and sin/cos/tan/sqrt/abs/ln/log/etc. Only use an explicit "points":[[x,y],...] array if the curve isn't a formula.
- Geometry: a fenced \`\`\`geometry block containing a self-contained <svg> (viewBox plus basic shapes only: line, polyline, polygon, rect, circle, ellipse, path, text). No scripts, styles, or external images.
Only add a visual when it truly clarifies the problem — most problems need none.`
