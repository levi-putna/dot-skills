import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { resolveScope } from '../lib/scope.js'
import { getAgent } from '../lib/agents.js'
import { parseSkillMd } from '../lib/frontmatter.js'
import { checkDependencies } from '../lib/installer.js'

export function installed({ global: isGlobal } = {}) {
  const scope = resolveScope({ global: isGlobal })
  const lock = scope.readLock()
  const names = Object.keys(lock.skills).sort()

  if (!names.length) {
    console.log(isGlobal ? 'No skills installed globally.' : 'No skills installed in this project.')
    return
  }

  for (const name of names) {
    const entry = lock.skills[name]
    const skillMdPath = join(scope.skillsDir, name, 'SKILL.md')
    let description = '(missing from .skills/ — lockfile is stale)'
    let dependencyLines = []
    if (existsSync(skillMdPath)) {
      const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
      description = data.description || '(no description)'
      dependencyLines = checkDependencies(data).map((dep) => {
        const status = dep.satisfied === undefined ? 'unknown' : dep.satisfied ? 'ok' : 'MISSING'
        return `    - [${status}] ${dep.type}: ${dep.name}`
      })
    }

    console.log(`\n${name}  (source: ${entry.source}${entry.branch ? `@${entry.branch}` : ''})`)
    console.log(`  ${description}`)
    console.log(`  linked into: ${entry.linkedAgents.map((k) => getAgent(k).name).join(', ') || '(none)'}`)
    if (dependencyLines.length) {
      console.log('  dependencies:')
      for (const line of dependencyLines) console.log(line)
    }
  }
}
