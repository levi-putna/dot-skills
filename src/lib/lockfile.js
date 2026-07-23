import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { globalSkillsRoot } from './agents.js'

const LOCKFILE_NAME = '.dot-skills-lock.json'

export function getProjectLockfilePath(cwd) {
  return join(cwd, LOCKFILE_NAME)
}

export function getGlobalLockfilePath() {
  return join(globalSkillsRoot(), 'lock.json')
}

function readLockfileAt(path) {
  if (!existsSync(path)) return { skills: {} }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return { skills: {}, ...data }
  } catch {
    return { skills: {} }
  }
}

function writeLockfileAt(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export function readLockfile(cwd) {
  return readLockfileAt(getProjectLockfilePath(cwd))
}

export function writeLockfile(cwd, data) {
  writeLockfileAt(getProjectLockfilePath(cwd), data)
}

export function readGlobalLockfile() {
  return readLockfileAt(getGlobalLockfilePath())
}

export function writeGlobalLockfile(data) {
  writeLockfileAt(getGlobalLockfilePath(), data)
}

// Record (or overwrite) a skill's install metadata. Dependency status is
// intentionally not cached here — doctor/installed re-read the live
// SKILL.md instead, so a stale lockfile entry can never lie about it.
export function recordSkill(lock, skillName, { source, branch, linkedAgents, version, contentHash }) {
  lock.skills[skillName] = {
    source: source || 'local',
    branch: branch || null,
    version: version || null,
    // Fingerprint of the files as installed — used by `update` to detect
    // local edits before overwriting them.
    contentHash: contentHash || null,
    linkedAgents: linkedAgents || [],
    installedAt: lock.skills[skillName]?.installedAt || nowIso(),
    updatedAt: nowIso(),
  }
  return lock
}

export function removeSkillRecord(lock, skillName) {
  delete lock.skills[skillName]
  return lock
}

/**
 * Resolve a user-supplied skill reference to a lockfile key.
 * Accepts the installed skill name, or an add-style
 * `owner/repo/skill-name[#ref]` path (matched by skill-name segment).
 * Returns the skill name, or null if nothing installed matches.
 */
export function resolveInstalledSkillName(lock, input) {
  if (!input) return null
  if (lock.skills[input]) return input

  // add-style "owner/repo/skill[#ref]" — strip the repo prefix / optional ref
  const withoutRef = String(input).split('#')[0]
  const segments = withoutRef.split('/').filter(Boolean)
  if (segments.length >= 3) {
    const skillName = segments.slice(2).join('/')
    if (lock.skills[skillName]) return skillName
  }
  return null
}

// Node's test runner freezes Date in some sandboxes; keep this isolated so it's easy to stub in tests.
function nowIso() {
  return new Date().toISOString()
}
