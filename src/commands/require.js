import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { resolveScope } from '../lib/scope.js'
import {
  parseSkillMd,
  stringifySkillMd,
  getId,
} from '../lib/frontmatter.js'
import { parseRepoSpec, fetchRawText, getDefaultBranch } from '../lib/github.js'
import { dim } from '../lib/format.js'

/**
 * Add a skill-to-skill dependency to a skill's `requires` frontmatter.
 * Verifies the dependency exists (locally or via GitHub) before writing.
 */
export async function requireSkill(skillName, dependencySpec, { global: isGlobal } = {}) {
  if (!skillName || !dependencySpec) {
    console.log(
      'Usage: dot-skills require <skill> <local-skill-name|owner/repo/skill-name[#ref]> [--global]',
    )
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
  const skillId = getId(data)

  let dep
  try {
    dep = await resolveDependencyTarget({ dependencySpec, skillsDir: scope.skillsDir })
  } catch (err) {
    clack.log.error(err.message)
    process.exitCode = 1
    return
  }

  if (!dep.id) {
    clack.log.error(
      `Add an "id" to "${dep.name}" before other skills can depend on it ` +
        `(e.g. node -e "console.log(crypto.randomUUID())").`,
    )
    process.exitCode = 1
    return
  }

  if (skillId && dep.id === skillId) {
    clack.log.error(`A skill cannot require itself ("${skillName}" id ${skillId}).`)
    process.exitCode = 1
    return
  }

  const entry = {
    id: dep.id,
    name: dep.name,
  }
  // Omit source for same-repo/local deps (defaults to self). Write an
  // explicit owner/repo[#ref] only for cross-repo dependencies.
  if (dep.source !== 'self') {
    entry.source = dep.source
  }

  const existing = Array.isArray(data.requires) ? [...data.requires] : []
  const idx = existing.findIndex((req) => req && req.id === dep.id)

  if (idx !== -1) {
    const prev = existing[idx]
    const prevSource = !prev.source || prev.source === 'self' ? 'self' : prev.source
    const nextSource = entry.source || 'self'
    const same =
      prevSource === nextSource &&
      (prev.name || undefined) === (entry.name || undefined)
    if (same) {
      clack.log.info(
        `"${skillName}" already requires ${dep.name} (${formatSourceLabel(nextSource)})`,
      )
      return
    }
    existing[idx] = entry
    data.requires = existing
    writeFileSync(skillMdPath, stringifySkillMd({ data, body }), 'utf8')
    clack.log.success(
      `Updated requires: ${dep.name} ${dim(`(${formatSourceLabel(nextSource)})`)} on "${skillName}"`,
    )
    return
  }

  existing.push(entry)
  data.requires = existing
  writeFileSync(skillMdPath, stringifySkillMd({ data, body }), 'utf8')
  clack.log.success(
    `Added requires: ${dep.name} ${dim(`(${formatSourceLabel(entry.source || 'self')})`)} to "${skillName}"`,
  )
}

/**
 * Resolve a dependency spec to { id, name, source }.
 * Bare names are treated as local siblings (source: self).
 * owner/repo/skill[#ref] is fetched from GitHub.
 */
async function resolveDependencyTarget({ dependencySpec, skillsDir }) {
  // Bare local name: no slash (and no #).
  if (!dependencySpec.includes('/') && !dependencySpec.includes('#')) {
    const skillMdPath = join(skillsDir, dependencySpec, 'SKILL.md')
    if (!existsSync(skillMdPath)) {
      throw new Error(
        `"${dependencySpec}" not found in ${skillsDir}. ` +
          `For a skill in another repo, pass owner/repo/${dependencySpec}.`,
      )
    }
    const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
    return {
      id: getId(data),
      name: typeof data.name === 'string' ? data.name : dependencySpec,
      source: 'self',
    }
  }

  let parsed
  try {
    parsed = parseRepoSpec(dependencySpec)
  } catch (err) {
    throw new Error(err.message)
  }

  if (!parsed.skillName) {
    throw new Error(
      `Dependency spec "${dependencySpec}" must include a skill name ` +
        `(e.g. owner/repo/skill-name).`,
    )
  }

  const branch = parsed.ref || (await getDefaultBranch(parsed.owner, parsed.repo))
  let content
  try {
    content = await fetchRawText({
      owner: parsed.owner,
      repo: parsed.repo,
      ref: branch,
      path: `.skills/${parsed.skillName}/SKILL.md`,
    })
  } catch (err) {
    throw new Error(
      `Could not fetch ${parsed.owner}/${parsed.repo}/${parsed.skillName}@${branch}: ` +
        (err.message || String(err)).split('\n')[0],
    )
  }

  const { data } = parseSkillMd(content)
  const source =
    `${parsed.owner}/${parsed.repo}` + (parsed.ref ? `#${parsed.ref}` : '')

  return {
    id: getId(data),
    name: typeof data.name === 'string' ? data.name : parsed.skillName,
    source,
  }
}

function formatSourceLabel(source) {
  return source === 'self' ? 'self' : source
}
