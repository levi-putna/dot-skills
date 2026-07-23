// Minimal ANSI formatting — no dependency, and a no-op when color would be
// wrong: piped/non-TTY output, NO_COLOR set, or a "dumb" terminal.
function colorEnabled() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
}

function style(open, close) {
  return (text) => (colorEnabled() ? `\x1b[${open}m${text}\x1b[${close}m` : text)
}

export const bold = style(1, 22)
export const dim = style(2, 22)
export const underline = style(4, 24)
export const blue = style(94, 39) // bright blue — plain blue (34) reads too dark on most default terminal themes
export const cyan = style(36, 39)
export const green = style(32, 39)
export const yellow = style(33, 39)
export const red = style(31, 39)

// clack's `note()` draws a border around whatever text it's given, sized to
// the longest line: 1 char border + 2 spaces of padding on each side. Text
// headed into a note has to wrap narrower than the terminal by this much,
// or the box itself ends up wider than the terminal and wraps ugly.
export const NOTE_BOX_OVERHEAD = 6

// Word-wrap to a comfortable reading width (capped even on very wide
// terminals, and floored so degenerate/very narrow terminals still get
// something readable), with every wrapped line indented so it nests under
// the heading above it instead of running flush-left. `boxOverhead` shaves
// extra columns off for content that will be re-wrapped in a bordered box
// (see NOTE_BOX_OVERHEAD above).
export function wrap(text, { indent = 4, maxWidth = 88, boxOverhead = 0 } = {}) {
  const columns = Math.min(process.stdout.columns || 80, maxWidth) - boxOverhead
  const width = Math.max(columns - indent, 20)
  const pad = ' '.repeat(indent)

  const lines = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > width && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)

  return lines.map((l) => pad + l).join('\n')
}

// "by <author> · <repo>", omitting whichever half is missing, or null if
// neither is present.
export function formatAttribution(author, repo) {
  if (!author && !repo) return null
  return [author ? `by ${author}` : null, repo].filter(Boolean).join(' · ')
}

// One skill entry: bold/colored name (with an optional "already installed"
// tag), an optional dimmed attribution line, then dimmed word-wrapped
// description.
export function formatSkillEntry(name, description, { installed, author, repo } = {}) {
  const tag = installed ? `  ${green('(already installed)')}` : ''
  const heading = `  ${bold(blue(name))}${tag}`
  const attribution = formatAttribution(author, repo)
  const lines = [heading]
  if (attribution) lines.push(dim(`    ${attribution}`))
  lines.push(dim(wrap(description || '(no description)', { indent: 4 })))
  return lines.join('\n')
}

export function formatHeader(text) {
  return bold(text)
}
