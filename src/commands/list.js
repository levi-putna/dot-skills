import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { parseRepoSpec, listSkillNames, fetchRawText } from '../lib/github.js'
import { parseSkillMd, getId, getAuthor, getRepo } from '../lib/frontmatter.js'
import { resolveScope } from '../lib/scope.js'
import { canonicalSkillsDir, canonicalGlobalSkillsDir } from '../lib/agents.js'
import { getBundledMetaSkillIds } from '../lib/paths.js'
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

  const fetched = await Promise.all(
    names.map(async (name) => {
      try {
        const content = await fetchRawText({ ...parsed, ref: branch, path: `.skills/${name}/SKILL.md` })
        const { data } = parseSkillMd(content)
        return {
          name,
          description: data.description || '',
          id: getId(data),
          author: getAuthor(data),
          repo: getRepo(data),
        }
      } catch {
        return { name, description: '(could not read description)', id: undefined }
      }
    }),
  )

  // The two starter skills (creating-skills, importing-skills) get copied
  // into every project's own .skills/ by `init` — listing them again for
  // every repo that happens to carry a copy would just be noise. Matched
  // by id, not name, so this still holds even if a copy gets renamed.
  const metaIds = new Set(getBundledMetaSkillIds())
  const visible = fetched.filter((entry) => !(entry.id && metaIds.has(entry.id)))
  const omitted = fetched.length - visible.length

  if (!visible.length) {
    console.log('Only starter skills here, already installed automatically by `dot-skills init` — nothing else to list.')
    return
  }

  const local = collectLocalIdentities()
  const entries = visible.map((entry) => ({
    ...entry,
    installed: (entry.id && local.ids.has(entry.id)) || local.names.has(entry.name),
  }))

  printEntries(formatHeader(`${parsed.owner}/${parsed.repo}@${branch}`), entries, { omitted })
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

  const entries = names.map((name) => {
    const skillMdPath = join(skillsDir, name, 'SKILL.md')
    if (!existsSync(skillMdPath)) return { name, description: '(no SKILL.md found)' }
    const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
    return { name, description: data.description || '(no description)', author: getAuthor(data), repo: getRepo(data) }
  })

  printEntries(formatHeader(isGlobal ? '~/.dot-skills/skills' : skillsDir), entries)
}

// Every skill (by id, and by name as a fallback for skills with no id)
// currently installed in either the project-local or global .skills/ —
// used to mark remote listing entries the user already has.
function collectLocalIdentities() {
  const ids = new Set()
  const names = new Set()
  for (const dir of [canonicalSkillsDir(process.cwd()), canonicalGlobalSkillsDir()]) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      names.add(entry.name)
      const skillMdPath = join(dir, entry.name, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue
      const id = getId(parseSkillMd(readFileSync(skillMdPath, 'utf8')).data)
      if (id) ids.add(id)
    }
  }
  return { ids, names }
}

function printEntries(headerText, entries, { omitted = 0 } = {}) {
  const count = `${entries.length} skill${entries.length === 1 ? '' : 's'}`
  const omittedNote = omitted ? `, ${omitted} starter skill${omitted === 1 ? '' : 's'} omitted` : ''
  console.log(`\n${headerText}  ${dim(`(${count}${omittedNote})`)}\n`)
  for (const entry of entries) {
    console.log(
      formatSkillEntry(entry.name, entry.description, {
        installed: entry.installed,
        author: entry.author,
        repo: entry.repo,
      }),
    )
    console.log()
  }
}
