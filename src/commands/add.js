import * as clack from '@clack/prompts'
import { parseRepoSpec, listSkillNames, fetchSkillFiles } from '../lib/github.js'
import { writeSkillFiles, linkSkill, formatDependencyNotice, hashSkillFiles } from '../lib/installer.js'
import { parseSkillMd, validateSkillData, getVersion } from '../lib/frontmatter.js'
import { getAgent } from '../lib/agents.js'
import { resolveScope } from '../lib/scope.js'
import { pickAgents } from '../lib/interactive.js'
import { recordSkill } from '../lib/lockfile.js'
import {
  resolveDependencyTree,
  formatRequiresInstallList,
} from '../lib/deps.js'

/**
 * Install one or more skills from a GitHub repo's `.skills/` folder,
 * resolving and installing any declared `requires` dependencies too.
 */
export async function add(spec, { global: isGlobal, agents: explicitAgents, all, skills: explicitSkills } = {}) {
  const cwd = process.cwd()
  clack.intro(`dot-skills add ${spec}`)

  if (!spec) {
    clack.outro('Usage: dot-skills add <owner/repo>[/skill-name][#branch] [--global]')
    process.exitCode = 1
    return
  }

  let parsed
  try {
    parsed = parseRepoSpec(spec)
  } catch (err) {
    clack.outro(err.message)
    process.exitCode = 1
    return
  }

  const spinner = clack.spinner()
  spinner.start(`Looking up .skills/ in ${parsed.owner}/${parsed.repo}`)
  let branch, availableNames
  try {
    ;({ branch, names: availableNames } = await listSkillNames(parsed))
  } catch (err) {
    spinner.stop('Lookup failed', 1)
    clack.outro(err.message)
    process.exitCode = 1
    return
  }
  spinner.stop(`Found ${availableNames.length} skill(s) on ${branch}`)

  if (!availableNames.length) {
    clack.outro(`No .skills/<name>/SKILL.md found in ${parsed.owner}/${parsed.repo}@${branch}`)
    process.exitCode = 1
    return
  }

  let skillNames
  if (parsed.skillName) {
    if (!availableNames.includes(parsed.skillName)) {
      clack.outro(`"${parsed.skillName}" not found. Available: ${availableNames.join(', ')}`)
      process.exitCode = 1
      return
    }
    skillNames = [parsed.skillName]
  } else if (explicitSkills) {
    skillNames = explicitSkills.filter((name) => availableNames.includes(name))
  } else if (!process.stdin.isTTY) {
    clack.outro(
      `Non-interactive shell: specify a skill via "add ${parsed.owner}/${parsed.repo}/<name>" or --skills=a,b.\n` +
        `Available: ${availableNames.join(', ')}`,
    )
    process.exitCode = 1
    return
  } else {
    const result = await clack.multiselect({
      message: `Which skill(s) to install from ${parsed.owner}/${parsed.repo}?`,
      options: availableNames.map((name) => ({ value: name })),
    })
    if (clack.isCancel(result)) {
      clack.cancel('Cancelled.')
      return
    }
    skillNames = result
  }

  const scope = resolveScope({ global: isGlobal, cwd })
  const agentKeys = await pickAgents(cwd, {
    message: isGlobal
      ? 'Link into which agents (global)?'
      : 'Link into which agents (this project)?',
    explicit: explicitAgents,
    all,
  })
  if (agentKeys === null) return

  // Fetch every directly-requested skill first, then resolve their requires.
  const roots = []
  for (const skillName of skillNames) {
    spinner.start(`Fetching ${skillName}`)
    let files, ref
    try {
      ;({ branch: ref, files } = await fetchSkillFiles({ ...parsed, ref: branch, skillName }))
    } catch (err) {
      spinner.stop(`Failed to fetch ${skillName}`, 1)
      clack.log.error(err.message)
      continue
    }
    spinner.stop(`Fetched ${skillName}`)

    const skillMdFile = files.find((f) => f.path === 'SKILL.md')
    const { data } = parseSkillMd(skillMdFile.content)
    const errors = validateSkillData(data, { source: `${skillName}/SKILL.md` })
    if (errors.length) {
      clack.log.warn(errors.join('\n'))
    }

    roots.push({
      skillName,
      data,
      files,
      branch: ref,
      parentSource: {
        kind: 'remote',
        owner: parsed.owner,
        repo: parsed.repo,
        ref,
      },
    })
  }

  if (!roots.length) {
    clack.outro('Nothing to install.')
    process.exitCode = 1
    return
  }

  let toInstall = []
  spinner.start('Resolving skill dependencies')
  try {
    ;({ toInstall } = await resolveDependencyTree(roots, { skillsDir: scope.skillsDir }))
  } catch (err) {
    spinner.stop('Dependency resolution failed', 1)
    clack.outro(err.message)
    process.exitCode = 1
    return
  }
  spinner.stop(
    toInstall.length
      ? `Resolved ${toInstall.length} additional skill dependenc${toInstall.length === 1 ? 'y' : 'ies'}`
      : 'No additional skill dependencies',
  )

  // Only remote deps need installing (self-local ones are already on disk).
  const remoteDeps = toInstall.filter((item) => item.files)

  if (remoteDeps.length) {
    const list = formatRequiresInstallList(remoteDeps)
    if (list) clack.note(list, 'Dependencies')

    if (process.stdin.isTTY) {
      const answer = await clack.confirm({
        message: `Install ${remoteDeps.length} dependenc${remoteDeps.length === 1 ? 'y' : 'ies'} as well?`,
        initialValue: true,
      })
      if (clack.isCancel(answer)) {
        clack.cancel('Cancelled.')
        return
      }
      if (!answer) {
        clack.outro('Cancelled — nothing installed.')
        return
      }
    }
  }

  const lock = scope.readLock()

  // Install dependencies first (dependency-first order from the resolver),
  // then the directly requested roots.
  for (const item of remoteDeps) {
    const targetDir = writeSkillFiles(scope.skillsDir, item.skillName, item.files)
    for (const key of agentKeys) {
      linkSkill(targetDir, scope.agentSkillsDir(key), item.skillName)
    }
    recordSkill(lock, item.skillName, {
      source: item.lockSource,
      branch: item.branch,
      version: getVersion(item.data),
      contentHash: hashSkillFiles(item.files),
      linkedAgents: agentKeys,
    })
    clack.log.success(`Installed dependency ${item.skillName}`)
    const notice = formatDependencyNotice(item.skillName, item.data)
    if (notice) clack.note(notice, 'Setup required')
  }

  for (const root of roots) {
    const targetDir = writeSkillFiles(scope.skillsDir, root.skillName, root.files)
    for (const key of agentKeys) {
      linkSkill(targetDir, scope.agentSkillsDir(key), root.skillName)
    }
    recordSkill(lock, root.skillName, {
      source: `${parsed.owner}/${parsed.repo}`,
      branch: root.branch,
      version: getVersion(root.data),
      contentHash: hashSkillFiles(root.files),
      linkedAgents: agentKeys,
    })
    const notice = formatDependencyNotice(root.skillName, root.data)
    if (notice) clack.note(notice, 'Setup required')
  }

  scope.writeLock(lock)

  clack.outro(
    `Installed into ${isGlobal ? '~/.dot-skills/skills' : scope.skillsDir}` +
      (agentKeys.length ? `, linked into: ${agentKeys.map((k) => getAgent(k).name).join(', ')}` : ''),
  )
}
