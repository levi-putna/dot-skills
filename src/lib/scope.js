import { canonicalSkillsDir, canonicalGlobalSkillsDir, getAgent } from './agents.js'
import { readLockfile, writeLockfile, readGlobalLockfile, writeGlobalLockfile } from './lockfile.js'

// Resolves the project-vs-global split so commands don't repeat the branch everywhere.
export function resolveScope({ global, cwd = process.cwd() } = {}) {
  if (global) {
    return {
      isGlobal: true,
      skillsDir: canonicalGlobalSkillsDir(),
      readLock: () => readGlobalLockfile(),
      writeLock: (data) => writeGlobalLockfile(data),
      agentSkillsDir: (key) => getAgent(key).globalSkillsDir(),
    }
  }
  return {
    isGlobal: false,
    skillsDir: canonicalSkillsDir(cwd),
    readLock: () => readLockfile(cwd),
    writeLock: (data) => writeLockfile(cwd, data),
    agentSkillsDir: (key) => getAgent(key).skillsDir(cwd),
  }
}
