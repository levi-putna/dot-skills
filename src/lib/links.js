import { existsSync, lstatSync, readdirSync, realpathSync } from 'fs'
import { join } from 'path'
import { readSkillFiles, hashSkillFiles, linkSkill, unlinkSkill } from './installer.js'

/**
 * Classify the on-disk state of one skill's link inside one agent's skills
 * directory, relative to the canonical copy in `skillsDir`.
 *
 * Possible statuses:
 *   ok          — symlink, resolves to the canonical skill dir
 *   missing     — nothing at all where the link should be
 *   broken      — a symlink whose target no longer exists
 *   wrong-target — a symlink, but it resolves somewhere other than the canonical dir
 *   copy        — a real directory (symlink fallback mode) whose contents match the canonical copy
 *   stale-copy  — a real directory whose contents differ from the canonical copy
 *   unexpected  — something else occupies the path (e.g. a plain file)
 */
export function classifyLink({ skillsDir, skillName, agentDir }) {
  const canonicalDir = join(skillsDir, skillName)
  const linkPath = join(agentDir, skillName)

  let lst
  try {
    lst = lstatSync(linkPath)
  } catch {
    return { status: 'missing' }
  }

  if (lst.isSymbolicLink()) {
    if (!existsSync(linkPath)) return { status: 'broken' }
    const target = realpathSync(linkPath)
    const canonical = realpathSync(canonicalDir)
    return target === canonical ? { status: 'ok' } : { status: 'wrong-target', target }
  }

  if (!lst.isDirectory()) return { status: 'unexpected' }

  const canonicalFiles = readSkillFiles(skillsDir, skillName)
  const copyFiles = readSkillFiles(agentDir, skillName)
  const matches =
    canonicalFiles && copyFiles && hashSkillFiles(canonicalFiles) === hashSkillFiles(copyFiles)
  return matches ? { status: 'copy' } : { status: 'stale-copy' }
}

/**
 * Audit every skill currently in `skillsDir` (scanned straight off disk, so
 * skills added by hand — not just ones recorded in the lockfile — are
 * covered too) against every agent in `agentKeys`. Also flags orphaned
 * entries: things sitting in an agent's skills dir with no matching skill
 * folder left in `skillsDir`.
 *
 * Returns an array of { skillName, agentKey, status, target? }, omitting
 * anything already correct ('ok' or a matching 'copy').
 */
export function auditLinks({ skillsDir, agentKeys, agentSkillsDir }) {
  const issues = []
  if (!existsSync(skillsDir)) return issues

  const skillNames = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
  const skillNameSet = new Set(skillNames)

  for (const key of agentKeys) {
    const dir = agentSkillsDir(key)

    // Don't skip agents whose skills dir doesn't exist yet — that's exactly
    // the "never linked at all" case this audit needs to surface, not a
    // reason to stay quiet about it.
    for (const skillName of skillNames) {
      const result = classifyLink({ skillsDir, skillName, agentDir: dir })
      if (result.status !== 'ok' && result.status !== 'copy') {
        issues.push({ skillName, agentKey: key, status: result.status, ...(result.target ? { target: result.target } : {}) })
      }
    }

    if (!existsSync(dir)) continue // nothing to scan for orphans

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if ((entry.isDirectory() || entry.isSymbolicLink()) && !skillNameSet.has(entry.name)) {
        issues.push({ skillName: entry.name, agentKey: key, status: 'orphan' })
      }
    }
  }

  return issues
}

/**
 * Repair everything `auditLinks` flagged: re-link missing/broken/wrong-target/
 * stale entries, and remove orphans. Returns the subset of `issues` actually
 * touched (in case some no-ops, e.g. an orphan that was already gone).
 */
export function fixLinks(issues, { skillsDir, agentSkillsDir }) {
  const fixed = []
  for (const issue of issues) {
    const dir = agentSkillsDir(issue.agentKey)
    if (issue.status === 'orphan') {
      if (unlinkSkill(dir, issue.skillName)) fixed.push(issue)
      continue
    }
    linkSkill(join(skillsDir, issue.skillName), dir, issue.skillName)
    fixed.push(issue)
  }
  return fixed
}
