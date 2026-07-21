import yaml from 'js-yaml'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Parse a SKILL.md file's contents into { data, body }.
// `data` is the YAML frontmatter (name, description, dependencies[], ...).
// `body` is the markdown instructions shown to the agent.
export function parseSkillMd(content) {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) {
    return { data: {}, body: content }
  }
  const data = yaml.load(match[1]) || {}
  return { data, body: match[2].replace(/^\n/, '') }
}

// Serialize { data, body } back into a SKILL.md file's contents.
export function stringifySkillMd({ data, body }) {
  const frontmatter = yaml.dump(data, { lineWidth: 0, noRefs: true }).trimEnd()
  return `---\n${frontmatter}\n---\n\n${body.trimStart()}\n`
}

// Normalize/validate the fields dot-skills cares about.
export function validateSkillData(data, { source = 'SKILL.md' } = {}) {
  const errors = []
  if (!data.name || typeof data.name !== 'string') {
    errors.push(`${source}: missing required "name" field`)
  }
  if (!data.description || typeof data.description !== 'string') {
    errors.push(`${source}: missing required "description" field`)
  }
  if (data.id !== undefined && (typeof data.id !== 'string' || !UUID_RE.test(data.id))) {
    errors.push(`${source}: "id" must be a UUID (e.g. generated with crypto.randomUUID())`)
  }
  if (data.author !== undefined && typeof data.author !== 'string') {
    errors.push(`${source}: "author" must be a string`)
  }
  if (data.repo !== undefined && (typeof data.repo !== 'string' || !/^https?:\/\//.test(data.repo))) {
    errors.push(`${source}: "repo" must be a URL (e.g. https://github.com/owner/repo)`)
  }
  if (data.dependencies !== undefined && !Array.isArray(data.dependencies)) {
    errors.push(`${source}: "dependencies" must be an array`)
  }
  for (const dep of data.dependencies || []) {
    if (!dep.type || !['env', 'cli'].includes(dep.type)) {
      errors.push(`${source}: dependency "${dep.name || '?'}" needs type "env" or "cli"`)
    }
    if (!dep.name) {
      errors.push(`${source}: dependency missing "name"`)
    }
  }
  return errors
}

export function getDependencies(data) {
  return Array.isArray(data.dependencies) ? data.dependencies : []
}

export function getId(data) {
  return typeof data.id === 'string' ? data.id : undefined
}

export function getAuthor(data) {
  return typeof data.author === 'string' ? data.author : undefined
}

export function getRepo(data) {
  return typeof data.repo === 'string' ? data.repo : undefined
}
