import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { canonicalSkillsDir, getAgent } from '../lib/agents.js'
import { writeSkillFiles, linkSkill } from '../lib/installer.js'
import { readLockfile, writeLockfile, recordSkill } from '../lib/lockfile.js'
import { BUNDLED_SKILLS_DIR, BUNDLED_META_SKILLS } from '../lib/paths.js'
import { pickAgents } from '../lib/interactive.js'

export async function init({ agents: explicit, all } = {}) {
  const cwd = process.cwd()
  clack.intro('dot-skills init')

  const skillsDir = canonicalSkillsDir(cwd)
  const alreadyInitialized = existsSync(skillsDir)
  mkdirSync(skillsDir, { recursive: true })

  const agentKeys = await pickAgents(cwd, {
    message: alreadyInitialized
      ? 'Which coding agents should .skills/ be linked into?'
      : 'Which coding agents does this project use?',
    explicit,
    all,
  })
  if (agentKeys === null) return

  const lock = readLockfile(cwd)

  for (const skillName of BUNDLED_META_SKILLS) {
    const targetDir = join(skillsDir, skillName)
    if (!existsSync(targetDir)) {
      const srcDir = join(BUNDLED_SKILLS_DIR, skillName)
      const files = readdirSync(srcDir).map((f) => ({
        path: f,
        content: readFileSync(join(srcDir, f), 'utf8'),
      }))
      writeSkillFiles(skillsDir, skillName, files)
      clack.log.info(`Added bundled skill "${skillName}" to .skills/`)
    }

    const linkedAgents = []
    for (const key of agentKeys) {
      const agent = getAgent(key)
      linkSkill(targetDir, agent.skillsDir(cwd), skillName)
      linkedAgents.push(key)
    }
    recordSkill(lock, skillName, {
      source: 'bundled',
      branch: null,
      linkedAgents,
    })
  }

  writeLockfile(cwd, lock)

  clack.outro(
    [
      `.skills/ is ready at ${skillsDir}`,
      agentKeys.length
        ? `Linked into: ${agentKeys.map((k) => getAgent(k).name).join(', ')}`
        : 'No agents linked yet — run `dot-skills link` once you have agent config dirs.',
      'Two starter skills are installed: "creating-skills" and "importing-skills".',
    ].join('\n'),
  )
}
