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

const HELP = `dot-skills — one .skills/ folder, linked out to every coding agent.

Usage:
  dot-skills init                          Set up .skills/ in this project, link into detected agents
  dot-skills add <owner/repo>[/skill][#ref] [--global]
                                            Install skill(s) from a repo's .skills/ folder
  dot-skills list [owner/repo]             List skills in a repo (or, with no args, in ./.skills/)
  dot-skills installed [--global]          Show installed skills, their agents, and dependency status
  dot-skills link [skill...] [--global]    (Re)link skills into agent directories
  dot-skills remove <skill> [--global]     Remove a skill and unlink it everywhere
  dot-skills doctor [--global]             Check declared dependencies for installed skills

Flags:
  --global              Act on ~/.dot-skills instead of the current project's .skills/
  --agents=a,b          Skip the interactive agent picker; link into exactly these agents
  --all                 Skip the interactive agent picker; link into every supported agent
  --skills=a,b          (add) Skip the interactive skill picker; install exactly these skills

Supported agents (keys): claude, cursor, copilot, windsurf, codex, gemini
(Claude Code, Cursor, GitHub Copilot, Windsurf, OpenAI Codex CLI, Gemini CLI)
`

async function main() {
  const [, , command, ...rest] = process.argv

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(HELP)
    return
  }

  if (command !== 'init') {
    const bootstrap = ensureFirstRunBootstrap()
    if (bootstrap) {
      console.log(
        `First run: installed starter skills ("creating-skills", "importing-skills") to ${bootstrap.globalSkillsDir}` +
          (bootstrap.linkedAgents.length ? ` and linked into ${bootstrap.linkedAgents.join(', ')}.` : '.'),
      )
    }
  }

  const { positional, flags } = parseArgs(rest)
  const agents = typeof flags.agents === 'string' ? flags.agents.split(',').filter(Boolean) : undefined
  const skills = typeof flags.skills === 'string' ? flags.skills.split(',').filter(Boolean) : undefined
  const all = Boolean(flags.all)
  const isGlobal = Boolean(flags.global)

  switch (command) {
    case 'init':
      await init({ agents, all })
      break
    case 'add':
      await add(positional[0], { global: isGlobal, agents, all, skills })
      break
    case 'list':
      await list(positional[0])
      break
    case 'installed':
      installed({ global: isGlobal })
      break
    case 'link':
      await link(positional, { global: isGlobal, agents, all })
      break
    case 'remove':
      await remove(positional[0], { global: isGlobal })
      break
    case 'doctor':
      doctor({ global: isGlobal })
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
