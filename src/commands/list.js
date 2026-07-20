import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { parseRepoSpec, listSkillNames, fetchRawText } from '../lib/github.js'
import { parseSkillMd } from '../lib/frontmatter.js'
import { resolveScope } from '../lib/scope.js'
import { formatSkillEntry, formatHeader, dim } from '../lib/format.js'

export async function list(spec, { global: isGlobal } = {}) {
  if (spec) {
    await listRemote(spec)
  } else {
    listLocal({ global: isGlobal })
  }
}

async function listRemote(spec) {
  const parsed = parseRepoSpec(spec)
  const spinner = clack.spinner()
  spinner.start(`Looking up .skills/ in ${parsed.owner}/${parsed.repo}`)
  let branch, names
  try {
    ;({ branch, names } = await listSkillNames(parsed))
  } catch (err) {
    spinner.stop('Lookup failed', 1)
    console.error(err.message)
    process.exitCode = 1
    return
  }
  spinner.stop(`${parsed.owner}/${parsed.repo}@${branch}`)

  if (!names.length) {
    console.log('No skills found (no .skills/<name>/SKILL.md entries).')
    return
  }

  const descriptions = await Promise.all(
    names.map(async (name) => {
      try {
        const content = await fetchRawText({ ...parsed, ref: branch, path: `.skills/${name}/SKILL.md` })
        return parseSkillMd(content).data.description || ''
      } catch {
        return '(could not read description)'
      }
    }),
  )

  printEntries(formatHeader(`${parsed.owner}/${parsed.repo}@${branch}`), names, descriptions)
}

function listLocal({ global: isGlobal }) {
  const scope = resolveScope({ global: isGlobal })
  const skillsDir = scope.skillsDir
  if (!existsSync(skillsDir)) {
    console.log(
      isGlobal
        ? 'No skills installed globally yet.'
        : 'No .skills/ directory here. Run `dot-skills init` first, or `dot-skills list <owner/repo>`.',
    )
    return
  }
  const names = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  if (!names.length) {
    console.log(`.skills/ is empty. Run \`dot-skills add <owner/repo>${isGlobal ? ' --global' : ''}\` to install one.`)
    return
  }

  const descriptions = names.map((name) => {
    const skillMdPath = join(skillsDir, name, 'SKILL.md')
    if (!existsSync(skillMdPath)) return '(no SKILL.md found)'
    const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
    return data.description || '(no description)'
  })

  printEntries(formatHeader(isGlobal ? '~/.dot-skills/skills' : skillsDir), names, descriptions)
}

function printEntries(headerText, names, descriptions) {
  const count = `${names.length} skill${names.length === 1 ? '' : 's'}`
  console.log(`\n${headerText}  ${dim(`(${count})`)}\n`)
  for (let i = 0; i < names.length; i++) {
    console.log(formatSkillEntry(names[i], descriptions[i]))
    console.log()
  }
}
