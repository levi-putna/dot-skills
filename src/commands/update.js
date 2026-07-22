import { rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import * as clack from '@clack/prompts'
import { fetchSkillFiles } from '../lib/github.js'
import {
  writeSkillFiles,
  linkSkill,
  readSkillFiles,
  hashSkillFiles,
  formatDependencyNotice,
} from '../lib/installer.js'
import { parseSkillMd, getVersion, getRequires } from '../lib/frontmatter.js'
import { compareVersions } from '../lib/version.js'
import { resolveScope } from '../lib/scope.js'
import { recordSkill } from '../lib/lockfile.js'
import { dim, green, yellow } from '../lib/format.js'
import {
  resolveDependencyTree,
  formatRequiresInstallList,
} from '../lib/deps.js'

const REPO_SOURCE_RE = /^[^/\s]+\/[^/\s]+$/

/**
 * Check installed skills against their source repos and pull down newer
 * versions. Skills whose local copy has been edited are only overwritten
 * after the user confirms (or with --force); anything that can't be
 * checked is reported as skipped, with the reason. After updates, also
 * installs any newly declared `requires` that are not yet present locally.
 */
export async function update(skillName, { global: isGlobal, force = false, interactive = true } = {}) {
  const cwd = process.cwd()
  clack.intro(`dot-skills update${skillName ? ` ${skillName}` : ''}`)

  const scope = resolveScope({ global: isGlobal, cwd })
  const lock = scope.readLock()
  const canPrompt = interactive && !force && Boolean(process.stdin.isTTY)

  let targets
  if (skillName) {
    if (!lock.skills[skillName]) {
      clack.outro(`"${skillName}" is not installed${isGlobal ? ' globally' : ' in this project'}.`)
      process.exitCode = 1
      return
    }
    targets = [skillName]
  } else {
    targets = Object.keys(lock.skills).sort()
  }

  if (!targets.length) {
    clack.outro(isGlobal ? 'No skills installed globally.' : 'No skills installed in this project.')
    return
  }

  const updated = []
  const upToDate = []
  const skipped = []
  // Skills whose requires we should repair after the update pass.
  const repairCandidates = []
  const spinner = clack.spinner()
  let cancelled = false

  for (const name of targets) {
    if (cancelled) {
      skipped.push({ name, reason: 'run cancelled' })
      continue
    }

    const entry = lock.skills[name]
    const check = await checkSkill({ name, entry, scope, spinner })

    if (check.status === 'skipped') {
      skipped.push({ name, reason: check.reason })
      continue
    }
    if (check.status === 'up-to-date') {
      // Backfill tracking data for skills installed before it existed, so
      // future runs can detect local edits. Assigned directly (not via
      // recordSkill) to leave updatedAt untouched.
      if (!entry.contentHash) entry.contentHash = check.localHash
      if (!entry.version && check.localVersion) entry.version = check.localVersion
      upToDate.push({ name, version: check.localVersion })
      repairCandidates.push({ name, entry, data: readLocalData(scope.skillsDir, name) })
      continue
    }

    // An update is available. Decide whether we're allowed to apply it.
    if (!force && check.modified !== false) {
      if (!canPrompt) {
        skipped.push({
          name,
          reason:
            check.modified === true
              ? 'has local changes — rerun with --force to overwrite them'
              : 'cannot verify local changes (installed before dot-skills tracked file contents) — rerun with --force to overwrite',
        })
        continue
      }
      const label = describeVersionChange(check.localVersion, check.remoteVersion)
      const answer = await clack.confirm({
        message:
          check.modified === true
            ? `"${name}" ${label}, but your local copy has been edited. Updating will overwrite those changes. Update anyway?`
            : `"${name}" ${label}, but dot-skills can't tell whether you've edited it locally. Updating will overwrite ${join(scope.skillsDir, name)}. Update anyway?`,
        initialValue: false,
      })
      if (clack.isCancel(answer)) {
        cancelled = true
        skipped.push({ name, reason: 'run cancelled' })
        continue
      }
      if (!answer) {
        skipped.push({ name, reason: 'update declined — local copy kept as-is' })
        continue
      }
    }

    spinner.start(`Updating ${name}`)
    try {
      applyUpdate({ name, entry, scope, lock, check })
    } catch (err) {
      spinner.stop(`Failed to update ${name}`, 1)
      skipped.push({ name, reason: `update failed: ${firstLine(err.message)}` })
      continue
    }
    const versionNote = check.remoteVersion
      ? ` (${check.localVersion ? `${check.localVersion} -> ` : ''}${check.remoteVersion})`
      : ''
    spinner.stop(`Updated ${name}${dim(versionNote)}`)
    updated.push({ name, from: check.localVersion, to: check.remoteVersion })

    const notice = formatDependencyNotice(name, check.remoteData)
    if (notice) clack.note(notice, 'Setup required')
    repairCandidates.push({ name, entry, data: check.remoteData })
  }

  // Install any requires that are declared but not yet present locally.
  if (!cancelled) {
    await repairMissingRequires({
      repairCandidates,
      scope,
      lock,
      force,
      interactive,
      spinner,
    })
  }

  scope.writeLock(lock)
  printSummary({ updated, upToDate, skipped })
}

/**
 * Resolve and install missing skill-to-skill dependencies for updated /
 * up-to-date skills, with a single confirmation prompt.
 */
async function repairMissingRequires({
  repairCandidates,
  scope,
  lock,
  force,
  interactive,
  spinner,
}) {
  const roots = []
  for (const candidate of repairCandidates) {
    if (!candidate.data || !getRequires(candidate.data).length) continue
    const source = candidate.entry.source || 'local'
    let parentSource = { kind: 'local' }
    if (REPO_SOURCE_RE.test(source)) {
      const [owner, repo] = source.split('/')
      parentSource = {
        kind: 'remote',
        owner,
        repo,
        ref: candidate.entry.branch || undefined,
      }
    }
    roots.push({
      skillName: candidate.name,
      data: candidate.data,
      parentSource,
    })
  }
  if (!roots.length) return

  spinner.start('Checking skill dependencies')
  let toInstall = []
  try {
    ;({ toInstall } = await resolveDependencyTree(roots, { skillsDir: scope.skillsDir }))
  } catch (err) {
    spinner.stop('Dependency resolution failed', 1)
    clack.log.warn(err.message)
    return
  }

  const remoteDeps = toInstall.filter((item) => item.files)
  if (!remoteDeps.length) {
    spinner.stop('All skill dependencies already installed')
    return
  }
  spinner.stop(
    `Found ${remoteDeps.length} missing skill dependenc${remoteDeps.length === 1 ? 'y' : 'ies'}`,
  )

  const list = formatRequiresInstallList(remoteDeps)
  if (list) clack.note(list, 'Missing dependencies')

  const canPrompt = interactive && !force && Boolean(process.stdin.isTTY)
  if (canPrompt) {
    const answer = await clack.confirm({
      message: `Install ${remoteDeps.length} missing dependenc${remoteDeps.length === 1 ? 'y' : 'ies'}?`,
      initialValue: true,
    })
    if (clack.isCancel(answer) || !answer) {
      clack.log.info('Skipped installing missing skill dependencies.')
      return
    }
  }
  // Otherwise (--force, --interactive=false, or no TTY): install automatically, matching `add`.

  // `toInstall` is dependency-first (leaves before the skill that requires
  // them), so a leaf's own requiring skill may not be in the lockfile yet
  // by the time we get to it — resolve agentKeys by walking the requiredBy
  // chain (through other pending installs) up to a skill the lockfile
  // already knows about, rather than assuming `requiredBy` is always
  // already recorded.
  const toInstallByName = new Map(toInstall.map((item) => [item.skillName, item]))
  const agentKeysByName = new Map()
  const resolveAgentKeys = (name) => {
    if (agentKeysByName.has(name)) return agentKeysByName.get(name)
    agentKeysByName.set(name, []) // cycle guard while resolving
    const existing = lock.skills[name]
    const keys = existing ? existing.linkedAgents || [] : resolveAgentKeys(toInstallByName.get(name)?.requiredBy)
    agentKeysByName.set(name, keys)
    return keys
  }

  for (const item of remoteDeps) {
    const agentKeys = resolveAgentKeys(item.requiredBy)
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
    agentKeysByName.set(item.skillName, agentKeys)
    clack.log.success(`Installed dependency ${item.skillName}`)
    const notice = formatDependencyNotice(item.skillName, item.data)
    if (notice) clack.note(notice, 'Setup required')
  }
}

function readLocalData(skillsDir, name) {
  const skillMdPath = join(skillsDir, name, 'SKILL.md')
  if (!existsSync(skillMdPath)) return null
  return parseSkillMd(readFileSync(skillMdPath, 'utf8')).data
}

// Fetch the remote copy of one skill and compare it to the local install.
// Returns { status: 'skipped' | 'up-to-date' | 'update-available', ... }.
async function checkSkill({ name, entry, scope, spinner }) {
  const source = entry.source || 'local'
  if (source === 'local') {
    return { status: 'skipped', reason: 'created locally — no source repository to check' }
  }
  if (source === 'bundled') {
    return { status: 'skipped', reason: 'bundled starter skill — ships with dot-skills itself' }
  }
  if (!REPO_SOURCE_RE.test(source)) {
    return { status: 'skipped', reason: `lockfile source "${source}" is not a usable owner/repo — reinstall with \`dot-skills add\`` }
  }

  const localFiles = readSkillFiles(scope.skillsDir, name)
  if (!localFiles) {
    return { status: 'skipped', reason: `missing from ${scope.skillsDir} — lockfile is stale, try \`dot-skills remove ${name}\`` }
  }

  const [owner, repo] = source.split('/')
  const at = `${source}${entry.branch ? `@${entry.branch}` : ''}`

  spinner.start(`Checking ${name} against ${at}`)
  let remote
  try {
    remote = await fetchSkillFiles({ owner, repo, ref: entry.branch || undefined, skillName: name })
  } catch (err) {
    spinner.stop(`Could not check ${name}`, 1)
    return { status: 'skipped', reason: describeFetchError(err, { name, at }) }
  }
  spinner.stop(`Checked ${name} against ${at}`)

  const localHash = hashSkillFiles(localFiles)
  const remoteHash = hashSkillFiles(remote.files)

  const localSkillMd = localFiles.find((f) => f.path === 'SKILL.md')
  const remoteSkillMd = remote.files.find((f) => f.path === 'SKILL.md')
  const localVersion = localSkillMd ? getVersion(parseSkillMd(localSkillMd.content).data) : undefined
  const remoteData = remoteSkillMd ? parseSkillMd(remoteSkillMd.content).data : {}
  const remoteVersion = getVersion(remoteData)

  if (localHash === remoteHash) {
    return { status: 'up-to-date', localHash, localVersion }
  }

  if (localVersion && remoteVersion && compareVersions(remoteVersion, localVersion) < 0) {
    return {
      status: 'skipped',
      reason: `installed version ${localVersion} is newer than ${remoteVersion} at ${at} — nothing to pull`,
    }
  }

  return {
    status: 'update-available',
    // undefined = unknown (no hash recorded at install time)
    modified: entry.contentHash ? localHash !== entry.contentHash : undefined,
    localHash,
    localVersion,
    remoteVersion,
    remoteFiles: remote.files,
    remoteBranch: remote.branch,
    remoteData,
  }
}

// Replace the local copy with the remote one, refresh agent links (a no-op
// for symlinks, a re-copy on filesystems without symlink support), and
// re-record the lockfile entry with the new version and content hash.
function applyUpdate({ name, entry, scope, lock, check }) {
  const skillDir = join(scope.skillsDir, name)
  if (existsSync(skillDir)) rmSync(skillDir, { recursive: true, force: true })
  const targetDir = writeSkillFiles(scope.skillsDir, name, check.remoteFiles)

  for (const key of entry.linkedAgents || []) {
    linkSkill(targetDir, scope.agentSkillsDir(key), name)
  }

  recordSkill(lock, name, {
    source: entry.source,
    branch: check.remoteBranch || entry.branch,
    version: check.remoteVersion,
    contentHash: hashSkillFiles(check.remoteFiles),
    linkedAgents: entry.linkedAgents,
  })
}

function describeVersionChange(from, to) {
  if (from && to) return `has a newer version (${from} -> ${to})`
  if (to) return `has a newer version (${to})`
  return 'has upstream changes'
}

function describeFetchError(err, { name, at }) {
  const message = err.message || String(err)
  if (message.includes('(404)')) {
    return `source ${at} no longer exists (or is now private) — repository returned 404`
  }
  if (message.startsWith('No SKILL.md found')) {
    return `no longer published at ${at} — the skill folder was removed upstream`
  }
  return `could not reach source ${at}: ${firstLine(message)}`
}

function firstLine(text) {
  return String(text).split('\n')[0]
}

function printSummary({ updated, upToDate, skipped }) {
  const lines = []

  for (const item of updated) {
    lines.push(`${green('updated')}     ${item.name}${item.to ? dim(`  ${item.from || '?'} -> ${item.to}`) : ''}`)
  }
  for (const item of upToDate) {
    lines.push(`${dim('up to date')}  ${item.name}${item.version ? dim(`  ${item.version}`) : ''}`)
  }
  for (const item of skipped) {
    lines.push(`${yellow('skipped')}     ${item.name}\n${dim(`             ${item.reason}`)}`)
  }

  if (lines.length) clack.note(lines.join('\n'), 'Results')

  const counts = [
    `${updated.length} updated`,
    `${upToDate.length} up to date`,
    skipped.length ? yellow(`${skipped.length} skipped`) : '0 skipped',
  ]
  clack.outro(counts.join(', '))
}
