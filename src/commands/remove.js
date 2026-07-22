import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { getAgent } from '../lib/agents.js'
import { unlinkSkill, removeCanonicalSkill } from '../lib/installer.js'
import { resolveScope } from '../lib/scope.js'
import { removeSkillRecord } from '../lib/lockfile.js'
import { parseSkillMd, getId } from '../lib/frontmatter.js'
import { findDependents } from '../lib/deps.js'

/**
 * Remove a skill from `.skills/` and unlink it from every agent.
 * Warns (and confirms) when other installed skills still declare a
 * `requires` entry pointing at this skill's id.
 */
export async function remove(skillName, { global: isGlobal, force = false, interactive = true } = {}) {
  if (!skillName) {
    console.log('Usage: dot-skills remove <skill-name> [--global]')
    process.exitCode = 1
    return
  }

  const cwd = process.cwd()
  const scope = resolveScope({ global: isGlobal, cwd })
  const lock = scope.readLock()
  const entry = lock.skills[skillName]

  const skillMdPath = join(scope.skillsDir, skillName, 'SKILL.md')
  let targetId
  if (existsSync(skillMdPath)) {
    targetId = getId(parseSkillMd(readFileSync(skillMdPath, 'utf8')).data)
  }

  if (targetId) {
    const dependents = findDependents({
      skillsDir: scope.skillsDir,
      targetId,
      excludeName: skillName,
    })
    if (dependents.length) {
      const names = dependents.map((d) => d.skillName)
      clack.note(
        names.map((n) => `  ${n}`).join('\n'),
        `"${skillName}" is still required by`,
      )

      const canPrompt = interactive && !force && Boolean(process.stdin.isTTY)
      if (canPrompt) {
        const answer = await clack.confirm({
          message: `Remove "${skillName}" anyway?`,
          initialValue: false,
        })
        if (clack.isCancel(answer) || !answer) {
          clack.cancel('Cancelled — skill kept.')
          return
        }
      } else if (!force) {
        clack.log.error(
          `Refusing to remove "${skillName}" — still required by: ${names.join(', ')}. ` +
            `Rerun with --force to remove anyway.`,
        )
        process.exitCode = 1
        return
      }
    }
  }

  const linkedAgents = entry?.linkedAgents || []
  for (const key of linkedAgents) {
    unlinkSkill(scope.agentSkillsDir(key), skillName)
  }

  const removed = removeCanonicalSkill(scope.skillsDir, skillName)
  removeSkillRecord(lock, skillName)
  scope.writeLock(lock)

  if (!removed && !linkedAgents.length) {
    console.log(`"${skillName}" was not installed.`)
    process.exitCode = 1
    return
  }

  clack.log.success(
    `Removed "${skillName}"` +
      (linkedAgents.length ? ` and unlinked from: ${linkedAgents.map((k) => getAgent(k).name).join(', ')}` : ''),
  )
}
