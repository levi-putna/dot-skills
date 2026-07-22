#!/usr/bin/env node
import { parseArgs } from '../src/lib/args.js'
import { ensureFirstRunBootstrap } from '../src/lib/bootstrap.js'
import { init } from '../src/commands/init.js'
import { add } from '../src/commands/add.js'
import { list } from '../src/commands/list.js'
import { installed } from '../src/commands/installed.js'
import { link } from '../src/commands/link.js'
import { remove } from '../src/commands/remove.js'
import { doctor } from '../src/commands/doctor.js'
import { update } from '../src/commands/update.js'
import { version } from '../src/commands/version.js'
import { requireSkill } from '../src/commands/require.js'

const HELP = `dot-skills — one .skills/ folder, linked out to every coding agent.

Usage:
  dot-skills init                          Set up .skills/ in this project, link into detected agents
  dot-skills add <owner/repo>[/skill][#ref] [--global]
                                            Install skill(s) from a repo's .skills/ folder
  dot-skills list [owner/repo] [--global]  List skills in a repo (or, with no args, in ./.skills/)
  dot-skills installed [--global]          Show installed skills, their agents, and dependency status
  dot-skills update [skill] [--global]     Check installed skills against their source repos and pull newer versions
  dot-skills link [skill...] [--global]    (Re)link skills into agent directories
  dot-skills remove <skill> [--global]     Remove a skill and unlink it everywhere
  dot-skills doctor [--global] [--links] [--fix]
                                            Check declared dependencies (and, with --links, symlink health) for installed skills
  dot-skills version <skill> <major|minor|patch|x.y.z> [--global]
                                            Bump or set a skill's version frontmatter
  dot-skills require <skill> <dep> [--global]
                                            Add a skill-to-skill dependency (local name or owner/repo/skill[#ref])

Flags:
  --global              Act on ~/.dot-skills instead of the current project's .skills/
  --agents=a,b          Skip the interactive agent picker; link into exactly these agents
  --all                 Skip the interactive agent picker; link into every supported agent
  --skills=a,b          (add) Skip the interactive skill picker; install exactly these skills
  --force               (update/remove) Overwrite or remove without confirming (default: false)
  --interactive=false   (update/remove) Never prompt on conflicts; skills with local changes (update) or
                         still-required dependents (remove) are skipped instead (default: true)
  --links               (doctor) Also audit symlinks between .skills/ and every agent's skills directory
  --fix                 (doctor) With --links, repair any symlink issues found instead of just reporting them

Supported agents (keys): claude, cursor, copilot, windsurf, codex, gemini
(Claude Code, Cursor, GitHub Copilot, Windsurf, OpenAI Codex CLI, Gemini CLI)
`

async function main() {
  const [, , command, ...rest] = process.argv

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(HELP)
    return
  }

  const bootstrap = ensureFirstRunBootstrap()
  if (bootstrap) {
    console.log(
      `First run: installed starter skills ("dotskills-create-skill", "dotskills-import-skill") to ${bootstrap.globalSkillsDir}` +
        (bootstrap.linkedAgents.length ? ` and linked into ${bootstrap.linkedAgents.join(', ')}.` : '.'),
    )
  }

  const { positional, flags } = parseArgs(rest, {
    booleans: ['global', 'all', 'force', 'interactive', 'no-interactive', 'links', 'fix'],
  })
  const agents = typeof flags.agents === 'string' ? flags.agents.split(',').filter(Boolean) : undefined
  const skills = typeof flags.skills === 'string' ? flags.skills.split(',').filter(Boolean) : undefined
  const all = Boolean(flags.all)
  const isGlobal = Boolean(flags.global)
  const force = flags.force === true || flags.force === 'true'
  const interactive = !flags['no-interactive'] && flags.interactive !== 'false' && flags.interactive !== false
  const links = Boolean(flags.links)
  const fix = Boolean(flags.fix)

  switch (command) {
    case 'init':
      await init({ agents, all })
      break
    case 'add':
      await add(positional[0], { global: isGlobal, agents, all, skills })
      break
    case 'list':
      await list(positional[0], { global: isGlobal })
      break
    case 'installed':
      installed({ global: isGlobal })
      break
    case 'update':
      await update(positional[0], { global: isGlobal, force, interactive })
      break
    case 'link':
      await link(positional, { global: isGlobal, agents, all })
      break
    case 'remove':
      await remove(positional[0], { global: isGlobal, force, interactive })
      break
    case 'doctor':
      doctor({ global: isGlobal, links, fix })
      break
    case 'version':
      await version(positional[0], positional[1], { global: isGlobal })
      break
    case 'require':
      await requireSkill(positional[0], positional[1], { global: isGlobal })
      break
    default:
      console.error(`Unknown command: ${command}\n`)
      console.log(HELP)
      process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exitCode = 1
})
