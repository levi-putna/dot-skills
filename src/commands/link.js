import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { getAgent } from '../lib/agents.js'
import { linkSkill } from '../lib/installer.js'
import { resolveScope } from '../lib/scope.js'
import { pickAgents } from '../lib/interactive.js'
import { recordSkill } from '../lib/lockfile.js'

export async function link(skillNames, { global: isGlobal, agents: explicitAgents, all } = {}) {
  const cwd = process.cwd()
  const scope = resolveScope({ global: isGlobal, cwd })

  if (!existsSync(scope.skillsDir)) {
    console.log(`No .skills/ directory at ${scope.skillsDir}. Run \`dot-skills init\` first.`)
    process.exitCode = 1
    return
  }

  const available = readdirSync(scope.skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  const targets = skillNames && skillNames.length ? skillNames.filter((n) => available.includes(n)) : available

  if (!targets.length) {
    console.log('No matching skills found in .skills/.')
    return
  }

  const agentKeys = await pickAgents(cwd, {
    message: isGlobal ? 'Link into which agents (global)?' : 'Link into which agents?',
    explicit: explicitAgents,
    all,
  })
  if (agentKeys === null) return

  const lock = scope.readLock()

  for (const name of targets) {
    const skillDir = join(scope.skillsDir, name)
    for (const key of agentKeys) {
      linkSkill(skillDir, scope.agentSkillsDir(key), name)
    }
    const existing = lock.skills[name] || {}
    recordSkill(lock, name, {
      source: existing.source,
      branch: existing.branch,
      linkedAgents: [...new Set([...(existing.linkedAgents || []), ...agentKeys])],
    })
    clack.log.success(`Linked ${name} -> ${agentKeys.map((k) => getAgent(k).name).join(', ') || '(nothing selected)'}`)
  }

  scope.writeLock(lock)
}
