import yaml from 'js-yaml'
import { isValidVersion } from './version.js'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// owner/repo, optionally with #ref — skill-name segments are allowed but unused for validation
const REPO_SOURCE_RE = /^[^/\s#]+\/[^/\s#]+(?:\/[^/\s#]+)*(?:#[^\s]+)?$/

/**
 * Test whether a string is a valid skill UUID.
 */
export function isValidSkillId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Parse a SKILL.md file's contents into { data, body }.
 * `data` is the YAML frontmatter (name, description, dependencies[], ...).
 * `body` is the markdown instructions shown to the agent.
 */
export function parseSkillMd(content) {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) {
    return { data: {}, body: content }
  }
  const data = yaml.load(match[1]) || {}
  return { data, body: match[2].replace(/^\n/, '') }
}

/**
 * Serialize { data, body } back into a SKILL.md file's contents.
 */
export function stringifySkillMd({ data, body }) {
  const frontmatter = yaml.dump(data, { lineWidth: 0, noRefs: true }).trimEnd()
  return `---\n${frontmatter}\n---\n\n${body.trimStart()}\n`
}

/**
 * Validate whether a requires `source` value is acceptable.
 * Accepts the literal `self`, or an owner/repo[#ref] string.
 */
export function isValidRequiresSource(source) {
  if (typeof source !== 'string' || !source.trim()) return false
  if (source === 'self') return true
  return REPO_SOURCE_RE.test(source)
}

/**
 * Normalize/validate the fields dot-skills cares about.
 */
export function validateSkillData(data, { source = 'SKILL.md' } = {}) {
  const errors = []
  if (!data.name || typeof data.name !== 'string') {
    errors.push(`${source}: missing required "name" field`)
  }
  if (!data.description || typeof data.description !== 'string') {
    errors.push(`${source}: missing required "description" field`)
  }
  if (data.id !== undefined && !isValidSkillId(data.id)) {
    errors.push(`${source}: "id" must be a UUID (e.g. generated with crypto.randomUUID())`)
  }
  if (data.author !== undefined && typeof data.author !== 'string') {
    errors.push(`${source}: "author" must be a string`)
  }
  if (data.version !== undefined && !isValidVersion(String(data.version))) {
    errors.push(`${source}: "version" must be a semver string (e.g. "1.0.0")`)
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
  if (data.requires !== undefined && !Array.isArray(data.requires)) {
    errors.push(`${source}: "requires" must be an array`)
  }
  for (const req of data.requires || []) {
    if (!req || typeof req !== 'object') {
      errors.push(`${source}: each "requires" entry must be an object`)
      continue
    }
    if (!isValidSkillId(req.id)) {
      errors.push(`${source}: requires entry needs a valid UUID "id"`)
    }
    if (req.source !== undefined && !isValidRequiresSource(req.source)) {
      errors.push(
        `${source}: requires "source" must be "self" or an owner/repo[#ref] (got "${req.source}")`,
      )
    }
    if (req.name !== undefined && typeof req.name !== 'string') {
      errors.push(`${source}: requires "name" must be a string`)
    }
  }
  return errors
}

export function getDependencies(data) {
  return Array.isArray(data.dependencies) ? data.dependencies : []
}

/**
 * Return normalized skill-to-skill dependencies from frontmatter.
 * Missing `source` and the literal `self` both normalize to `source: 'self'`.
 */
export function getRequires(data) {
  if (!Array.isArray(data.requires)) return []
  return data.requires
    .filter((req) => req && typeof req === 'object' && isValidSkillId(req.id))
    .map((req) => ({
      id: req.id,
      source: !req.source || req.source === 'self' ? 'self' : String(req.source),
      name: typeof req.name === 'string' && req.name ? req.name : undefined,
    }))
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

/**
 * YAML happily parses `version: 1.0` as a number, so coerce before validating.
 */
export function getVersion(data) {
  if (data.version === undefined || data.version === null) return undefined
  const version = String(data.version)
  return isValidVersion(version) ? version : undefined
}
