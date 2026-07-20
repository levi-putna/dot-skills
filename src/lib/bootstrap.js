import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { canonicalGlobalSkillsDir, detectGlobalAgents, getAgent } from './agents.js'
import { writeSkillFiles, linkSkill } from './installer.js'
import { readGlobalLockfile, writeGlobalLockfile, recordSkill } from './lockfile.js'
import { BUNDLED_SKILLS_DIR, BUNDLED_META_SKILLS } from './paths.js'

// Runs once ever, the first time `dot-skills` is invoked on a machine:
// installs the two starter meta-skills into the global canonical store and
// links them into every coding agent already in use on this machine.
// No-op (and silent) on every run after the first.
export function ensureFirstRunBootstrap() {
  const lock = readGlobalLockfile()
  const alreadyRan = Object.keys(lock.skills).length > 0
  if (alreadyRan) return null

  const globalSkillsDir = canonicalGlobalSkillsDir()
  const agentKeys = detectGlobalAgents()

  for (const skillName of BUNDLED_META_SKILLS) {
    const srcDir = join(BUNDLED_SKILLS_DIR, skillName)
    const files = readdirSync(srcDir).map((f) => ({
      path: f,
      content: readFileSync(join(srcDir, f), 'utf8'),
    }))
    const targetDir = writeSkillFiles(globalSkillsDir, skillName, files)

    for (const key of agentKeys) {
      linkSkill(targetDir, getAgent(key).globalSkillsDir(), skillName)
    }

    recordSkill(lock, skillName, {
      source: 'bundled',
      branch: null,
      linkedAgents: agentKeys,
    })
  }

  writeGlobalLockfile(lock)

  return {
    globalSkillsDir,
    linkedAgents: agentKeys.map((key) => getAgent(key).name),
  }
}
