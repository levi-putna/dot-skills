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

// Record (or overwrite) a skill's install metadata.
export function recordSkill(lock, skillName, { source, branch, linkedAgents, dependencies }) {
  lock.skills[skillName] = {
    source: source || 'local',
    branch: branch || null,
    linkedAgents: linkedAgents || [],
    dependencies: dependencies || [],
    installedAt: lock.skills[skillName]?.installedAt || nowIso(),
    updatedAt: nowIso(),
  }
  return lock
}

export function removeSkillRecord(lock, skillName) {
  delete lock.skills[skillName]
  return lock
}

// Node's test runner freezes Date in some sandboxes; keep this isolated so it's easy to stub in tests.
function nowIso() {
  return new Date().toISOString()
}
