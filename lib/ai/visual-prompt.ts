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

To graph functions or plot points, emit a fenced block tagged "plot" containing JSON:
\`\`\`plot
{"title":"y = x^2","xLabel":"x","yLabel":"y","xDomain":[-4,4],"series":[{"label":"y = x^2","color":"#f97316","points":[[-4,16],[-2,4],[0,0],[2,4],[4,16]]}],"points":[{"x":2,"y":4,"label":"(2, 4)"}]}
\`\`\`
Sample ~30-60 evenly spaced [x, y] points across the domain so curves are smooth. "series" draw connected lines; "points" are individual labeled dots. xDomain and yDomain are optional.

To draw geometry (triangles, angles, number lines, coordinate figures), emit a fenced block tagged "geometry" containing a self-contained <svg> with a viewBox, using only basic shapes (line, polyline, polygon, rect, circle, ellipse, path, text) and <text> labels. No scripts, styles, or external images.

Keep text outside the blocks concise.`

/**
 * For responses where the problem text lives inside a JSON string value (the
 * practice-set and live-problem generators). Emphasizes JSON escaping so the
 * output stays parseable.
 */
export const VISUAL_PROMPT_JSON = `Write math with LaTeX (inline $...$, block $$...$$). These fields sit inside a JSON string, so escape every backslash as \\\\ (e.g. "$\\\\frac{1}{2}$") and every newline as \\n so the JSON stays valid.

When a graph or diagram genuinely helps a problem, embed one directly inside the "question" string (escape its newlines as \\n too):
- Function graphs: a fenced \`\`\`plot block containing JSON like {"xDomain":[-4,4],"series":[{"label":"y = x^2","points":[[-4,16],[0,0],[4,16]]}]}. Sample 30-60 evenly spaced points for smooth curves.
- Geometry: a fenced \`\`\`geometry block containing a self-contained <svg> (viewBox plus basic shapes only: line, polyline, polygon, rect, circle, ellipse, path, text). No scripts, styles, or external images.
Only add a visual when it truly clarifies the problem — most problems need none.`
