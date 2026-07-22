import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { resolveScope } from '../lib/scope.js'
import { getAgent } from '../lib/agents.js'
import { parseSkillMd, getAuthor, getRepo, getVersion } from '../lib/frontmatter.js'
import { checkDependencies } from '../lib/installer.js'
import { bold, blue, dim, green, red, wrap, formatAttribution } from '../lib/format.js'

export function installed({ global: isGlobal } = {}) {
  const scope = resolveScope({ global: isGlobal })
  const lock = scope.readLock()
  const names = Object.keys(lock.skills).sort()

  if (!names.length) {
    console.log(isGlobal ? 'No skills installed globally.' : 'No skills installed in this project.')
    return
  }

  console.log()
  for (const name of names) {
    const entry = lock.skills[name]
    const skillMdPath = join(scope.skillsDir, name, 'SKILL.md')
    let description = null
    let dependencies = []
    let author, repo, version
    if (existsSync(skillMdPath)) {
      const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
      description = data.description || '(no description)'
      dependencies = checkDependencies(data)
      author = getAuthor(data)
      repo = getRepo(data)
      version = getVersion(data)
    }

    const source = `${entry.source}${entry.branch ? `@${entry.branch}` : ''}`
    const versionTag = version || entry.version
    console.log(`  ${bold(blue(name))}${versionTag ? ` ${dim(`v${versionTag}`)}` : ''}  ${dim(`(${source})`)}`)
    const attribution = formatAttribution(author, repo)
    if (attribution) console.log(dim(`    ${attribution}`))
    console.log(
      description
        ? wrap(description, { indent: 4 })
        : `    ${red('missing from .skills/ — lockfile is stale, try `dot-skills remove ' + name + '`')}`,
    )
    console.log(dim(`    linked into: ${entry.linkedAgents.map((k) => getAgent(k).name).join(', ') || '(none)'}`))

    if (dependencies.length) {
      console.log(dim('    dependencies:'))
      for (const dep of dependencies) {
        const status =
          dep.satisfied === undefined ? dim('unknown') : dep.satisfied ? green('ok') : red('MISSING')
        console.log(`      [${status}] ${dep.type}: ${dep.name}`)
      }
    }
    console.log()
  }
}
