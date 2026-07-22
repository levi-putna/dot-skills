import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { resolveScope } from '../lib/scope.js'
import { parseSkillMd, stringifySkillMd, getVersion } from '../lib/frontmatter.js'
import { bumpVersion, compareVersions } from '../lib/version.js'
import { dim, yellow } from '../lib/format.js'

/**
 * Bump or set the `version` field in a skill's SKILL.md frontmatter.
 */
export async function version(skillName, kind, { global: isGlobal } = {}) {
  if (!skillName || !kind) {
    console.log('Usage: dot-skills version <skill> <major|minor|patch|x.y.z> [--global]')
    process.exitCode = 1
    return
  }

  const scope = resolveScope({ global: isGlobal })
  const skillMdPath = join(scope.skillsDir, skillName, 'SKILL.md')

  if (!existsSync(skillMdPath)) {
    clack.log.error(
      `"${skillName}" is not installed${isGlobal ? ' globally' : ' in this project'} ` +
        `(no SKILL.md at ${skillMdPath}).`,
    )
    process.exitCode = 1
    return
  }

  const content = readFileSync(skillMdPath, 'utf8')
  const { data, body } = parseSkillMd(content)
  const current = getVersion(data)

  let result
  try {
    result = bumpVersion(current, kind)
  } catch (err) {
    clack.log.error(err.message)
    process.exitCode = 1
    return
  }

  if (current && result.version === current) {
    clack.log.info(`"${skillName}" is already at ${current}`)
    return
  }

  if (current && compareVersions(result.version, current) < 0) {
    clack.log.warn(
      yellow(
        `Setting "${skillName}" to ${result.version}, which is older than the current ${current}`,
      ),
    )
  }

  data.version = result.version
  writeFileSync(skillMdPath, stringifySkillMd({ data, body }), 'utf8')

  if (result.initialized && !current) {
    clack.log.success(`"${skillName}" ${dim('version set to')} ${result.version}`)
  } else {
    clack.log.success(
      `"${skillName}" ${dim(`${result.from || '?'} ->`)} ${result.version}`,
    )
  }
}
