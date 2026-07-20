import * as clack from '@clack/prompts'
import { getAgent } from '../lib/agents.js'
import { unlinkSkill, removeCanonicalSkill } from '../lib/installer.js'
import { resolveScope } from '../lib/scope.js'
import { removeSkillRecord } from '../lib/lockfile.js'

export async function remove(skillName, { global: isGlobal } = {}) {
  if (!skillName) {
    console.log('Usage: dot-skills remove <skill-name> [--global]')
    process.exitCode = 1
    return
  }

  const cwd = process.cwd()
  const scope = resolveScope({ global: isGlobal, cwd })
  const lock = scope.readLock()
  const entry = lock.skills[skillName]

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
