import * as clack from '@clack/prompts'
import { parseRepoSpec, listSkillNames, fetchSkillFiles } from '../lib/github.js'
import { writeSkillFiles, linkSkill, formatDependencyNotice, hashSkillFiles } from '../lib/installer.js'
import { parseSkillMd, validateSkillData, getVersion } from '../lib/frontmatter.js'
import { getAgent } from '../lib/agents.js'
import { resolveScope } from '../lib/scope.js'
import { pickAgents } from '../lib/interactive.js'
import { recordSkill } from '../lib/lockfile.js'

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

  const lock = scope.readLock()

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

    const targetDir = writeSkillFiles(scope.skillsDir, skillName, files)

    for (const key of agentKeys) {
      linkSkill(targetDir, scope.agentSkillsDir(key), skillName)
    }

    recordSkill(lock, skillName, {
      source: `${parsed.owner}/${parsed.repo}`,
      branch: ref,
      version: getVersion(data),
      contentHash: hashSkillFiles(files),
      linkedAgents: agentKeys,
    })

    const notice = formatDependencyNotice(skillName, data)
    if (notice) clack.note(notice, 'Setup required')
  }

  scope.writeLock(lock)

  clack.outro(
    `Installed into ${isGlobal ? '~/.dot-skills/skills' : scope.skillsDir}` +
      (agentKeys.length ? `, linked into: ${agentKeys.map((k) => getAgent(k).name).join(', ')}` : ''),
  )
}
