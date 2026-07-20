import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { parseRepoSpec, listSkillNames, fetchRawText } from '../lib/github.js'
import { parseSkillMd } from '../lib/frontmatter.js'
import { canonicalSkillsDir } from '../lib/agents.js'

export async function list(spec) {
  if (spec) {
    await listRemote(spec)
  } else {
    listLocal(process.cwd())
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

  for (const name of names) {
    let description = ''
    try {
      const content = await fetchRawText({ ...parsed, ref: branch, path: `.skills/${name}/SKILL.md` })
      description = parseSkillMd(content).data.description || ''
    } catch {
      description = '(could not read description)'
    }
    console.log(`\n${name}`)
    console.log(`  ${description}`)
  }
}

function listLocal(cwd) {
  const skillsDir = canonicalSkillsDir(cwd)
  if (!existsSync(skillsDir)) {
    console.log('No .skills/ directory here. Run `dot-skills init` first, or `dot-skills list <owner/repo>`.')
    return
  }
  const names = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  if (!names.length) {
    console.log('.skills/ is empty. Run `dot-skills add <owner/repo>` to install one.')
    return
  }

  for (const name of names) {
    const skillMdPath = join(skillsDir, name, 'SKILL.md')
    let description = '(no SKILL.md found)'
    if (existsSync(skillMdPath)) {
      const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
      description = data.description || '(no description)'
    }
    console.log(`\n${name}`)
    console.log(`  ${description}`)
  }
}
