import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { resolveScope } from '../lib/scope.js'
import { parseSkillMd } from '../lib/frontmatter.js'
import { checkDependencies } from '../lib/installer.js'
import { checkRequires } from '../lib/deps.js'
import { auditLinks, fixLinks } from '../lib/links.js'
import { detectAgents, detectGlobalAgents, getAgent } from '../lib/agents.js'
import { recordSkill } from '../lib/lockfile.js'
import { bold, blue, dim, green, red, yellow } from '../lib/format.js'

/**
 * Check every installed skill's declared env/cli dependencies and
 * skill-to-skill `requires` against the current environment / install.
 *
 * With `links: true`, also audits the symlinks between `.skills/` and every
 * agent's skills directory (scanned straight off disk, so hand-added skills
 * are covered too, not just ones recorded in the lockfile). With
 * `fix: true`, anything the audit flags gets repaired in place.
 */
export function doctor({ global: isGlobal, links, fix } = {}) {
  const scope = resolveScope({ global: isGlobal })
  const lock = scope.readLock()
  const names = Object.keys(lock.skills).sort()

  if (!names.length && !links) {
    console.log('No skills installed.')
    return
  }

  let missingRequired = 0
  let missingRequires = 0
  for (const name of names) {
    const skillMdPath = join(scope.skillsDir, name, 'SKILL.md')
    if (!existsSync(skillMdPath)) {
      console.log(`${name}: SKILL.md missing at ${skillMdPath} (lockfile is stale — try \`dot-skills remove ${name}\`)`)
      continue
    }
    const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
    const deps = checkDependencies(data)
    const requires = checkRequires(data, { skillsDir: scope.skillsDir })

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

    for (const req of requires) {
      if (!req.satisfied) {
        missingRequires++
        const label = req.skillName || req.name || req.id
        const sourceLabel = req.source === 'self' ? 'self' : req.source
        console.log(
          `${bold(blue(name))}: [${red('required')}] skill "${label}" (${sourceLabel}) is not installed` +
            ` -> run \`dot-skills update ${name}\` or \`dot-skills add ${sourceLabel === 'self' ? '<owner/repo>/' + (req.name || label) : sourceLabel + '/' + (req.name || label)}\``,
        )
      }
    }
  }

  let linkIssues = 0
  let linkFixed = 0
  let agentCount = 0
  if (links) {
    ;({ linkIssues, linkFixed, agentCount } = auditAndReportLinks(scope, lock, { fix }))
  }

  const problems = missingRequired + missingRequires + linkIssues
  if (problems) {
    const parts = []
    if (missingRequired) {
      parts.push(
        `${missingRequired} required env/cli dependenc${missingRequired === 1 ? 'y' : 'ies'} missing`,
      )
    }
    if (missingRequires) {
      parts.push(
        `${missingRequires} required skill${missingRequires === 1 ? '' : 's'} missing`,
      )
    }
    if (linkIssues) {
      parts.push(
        `${linkIssues} symlink issue${linkIssues === 1 ? '' : 's'}` +
          (!fix ? ' (rerun with `--links --fix` to repair)' : ''),
      )
    }
    console.log(`\n${red(parts.join('; ') + '.')}`)
    process.exitCode = 1
  } else {
    const extras = []
    if (links) {
      extras.push(
        linkFixed
          ? `fixed ${linkFixed} symlink issue${linkFixed === 1 ? '' : 's'}`
          : `symlinks correct across ${agentCount} agent${agentCount === 1 ? '' : 's'}`,
      )
    }
    console.log(
      `\n${green('All required dependencies satisfied')} ` +
        `(CLI-tool dependencies cannot be auto-checked)` +
        (extras.length ? `; ${extras.join('; ')}` : '') +
        '.',
    )
  }
}

/**
 * Audit (and, with `fix: true`, repair) symlinks between `.skills/` and
 * every agent's skills directory. Prints one line per issue found; returns
 * the counts `doctor()` needs to fold into its overall summary.
 */
function auditAndReportLinks(scope, lock, { fix } = {}) {
  const agentKeys = collectAgentKeys(scope, lock)
  const issues = auditLinks({
    skillsDir: scope.skillsDir,
    agentKeys,
    agentSkillsDir: scope.agentSkillsDir,
  })

  if (!issues.length) {
    return { linkIssues: 0, linkFixed: 0, agentCount: agentKeys.length }
  }

  const fixedIssues = fix
    ? fixLinks(issues, { skillsDir: scope.skillsDir, agentSkillsDir: scope.agentSkillsDir })
    : []
  const fixedSet = new Set(fixedIssues.map(issueKey))

  console.log()
  for (const issue of issues) {
    const tag = fixedSet.has(issueKey(issue)) ? green('fixed') : red(issue.status)
    console.log(
      `${bold(blue(issue.skillName))} ${dim(`(${getAgent(issue.agentKey).name})`)}: ` +
        `[${tag}] ${describeStatus(issue.status)}`,
    )
  }

  if (fix && fixedIssues.length) {
    syncLockfileLinks(scope, lock, { agentKeys, issues, fixedSet })
    scope.writeLock(lock)
  }

  return {
    linkIssues: issues.length - fixedIssues.length,
    linkFixed: fixedIssues.length,
    agentCount: agentKeys.length,
  }
}

function issueKey(issue) {
  return `${issue.agentKey}:${issue.skillName}:${issue.status}`
}

// After a --fix run, bring each skill's lockfile `linkedAgents` in line with
// what's actually on disk now — otherwise `dot-skills installed` would keep
// showing stale link info, and hand-added skills (never recorded before)
// would still be invisible to it.
function syncLockfileLinks(scope, lock, { agentKeys, issues, fixedSet }) {
  const skillNames = readdirSync(scope.skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  const stillBroken = new Set(
    issues
      .filter((issue) => issue.status !== 'orphan' && !fixedSet.has(issueKey(issue)))
      .map((issue) => `${issue.skillName}:${issue.agentKey}`),
  )

  for (const name of skillNames) {
    const linkedAgents = agentKeys.filter((key) => !stillBroken.has(`${name}:${key}`))
    const existing = lock.skills[name] || {}
    recordSkill(lock, name, {
      source: existing.source,
      branch: existing.branch,
      version: existing.version,
      contentHash: existing.contentHash,
      linkedAgents,
    })
  }
}

function describeStatus(status) {
  switch (status) {
    case 'missing':
      return "isn't linked"
    case 'broken':
      return 'symlink target no longer exists'
    case 'wrong-target':
      return 'symlink points somewhere unexpected'
    case 'stale-copy':
      return 'copy is out of date with .skills/'
    case 'unexpected':
      return 'something unexpected is in the way'
    case 'orphan':
      return 'no matching skill left in .skills/'
    default:
      return status
  }
}

// Agents to check: whichever are detected in this project/machine, plus any
// agent a skill's lockfile entry claims it's linked into (covers agents
// whose detection marker got removed after linking).
function collectAgentKeys(scope, lock) {
  const keys = new Set(scope.isGlobal ? detectGlobalAgents() : detectAgents(process.cwd()))
  for (const entry of Object.values(lock.skills)) {
    for (const key of entry.linkedAgents || []) keys.add(key)
  }
  return [...keys]
}
