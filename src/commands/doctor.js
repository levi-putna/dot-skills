import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { resolveScope } from '../lib/scope.js'
import { parseSkillMd } from '../lib/frontmatter.js'
import { checkDependencies } from '../lib/installer.js'
import { bold, blue, green, red, yellow } from '../lib/format.js'

export function doctor({ global: isGlobal } = {}) {
  const scope = resolveScope({ global: isGlobal })
  const lock = scope.readLock()
  const names = Object.keys(lock.skills).sort()

  if (!names.length) {
    console.log('No skills installed.')
    return
  }

  let missingRequired = 0
  for (const name of names) {
    const skillMdPath = join(scope.skillsDir, name, 'SKILL.md')
    if (!existsSync(skillMdPath)) {
      console.log(`${name}: SKILL.md missing at ${skillMdPath} (lockfile is stale — try \`dot-skills remove ${name}\`)`)
      continue
    }
    const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
    const deps = checkDependencies(data)
    if (!deps.length) continue

    for (const dep of deps) {
      if (dep.satisfied === false) {
        const required = dep.required !== false
        if (required) missingRequired++
        const tag = required ? red('required') : yellow('optional')
        console.log(
          `${bold(blue(name))}: [${tag}] ${dep.type} "${dep.name}" is not set` +
            (dep.instructions ? ` -> ${dep.instructions}` : ''),
        )
      }
    }
  }

  if (missingRequired) {
    console.log(`\n${red(`${missingRequired} required dependenc${missingRequired === 1 ? 'y' : 'ies'} missing.`)}`)
    process.exitCode = 1
  } else {
    console.log(`\n${green('All required dependencies satisfied')} (CLI-tool dependencies cannot be auto-checked).`)
  }
}
