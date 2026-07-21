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
export const blue = style(94, 39) // bright blue — plain blue (34) reads too dark on most default terminal themes
export const cyan = style(36, 39)
export const green = style(32, 39)
export const yellow = style(33, 39)
export const red = style(31, 39)

// Word-wrap to a comfortable reading width (capped even on very wide
// terminals), with every wrapped line indented so it nests under the
// heading above it instead of running flush-left.
export function wrap(text, { indent = 4, maxWidth = 88 } = {}) {
  const columns = Math.min(process.stdout.columns || 80, maxWidth)
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

// One skill entry: bold/colored name (with an optional "already installed"
// tag), dimmed word-wrapped description.
export function formatSkillEntry(name, description, { installed } = {}) {
  const tag = installed ? `  ${green('(already installed)')}` : ''
  const heading = `  ${bold(blue(name))}${tag}`
  const body = wrap(description || '(no description)', { indent: 4 })
  return `${heading}\n${dim(body)}`
}

export function formatHeader(text) {
  return bold(text)
}
