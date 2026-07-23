import * as clack from '@clack/prompts'
import {
  fetchSkillFiles,
  getDefaultBranch,
  diffSkillFiles,
  createSkillPullRequest,
  requireAuthToken,
} from '../lib/github.js'
import { readSkillFiles, hashSkillFiles } from '../lib/installer.js'
import { parseSkillMd, getVersion } from '../lib/frontmatter.js'
import { resolveScope } from '../lib/scope.js'
import { resolveInstalledSkillName } from '../lib/lockfile.js'
import { openInBrowser, waitForSpaceOrEnter } from '../lib/browser.js'
import { bold, cyan, dim, green, yellow, red, underline } from '../lib/format.js'

const REPO_SOURCE_RE = /^[^/\s]+\/[^/\s]+$/

/**
 * Push local edits for an installed skill back to its source repo as a
 * pull request. Uses the GitHub API (GITHUB_TOKEN / GH_TOKEN) — does not
 * require git or the gh CLI, and does not touch the consuming project's
 * own git history.
 */
export async function push(
  skillName,
  {
    global: isGlobal,
    force = false,
    interactive = true,
    title,
    body,
    // Injectable for tests — defaults to opening the system browser.
    openUrl = openInBrowser,
  } = {},
) {
  if (!skillName) {
    console.log('Usage: dot-skills push <skill|owner/repo/skill> [--global] [--title=...] [--body=...]')
    process.exitCode = 1
    return
  }

  clack.intro(`dot-skills push ${skillName}`)

  try {
    requireAuthToken()
  } catch (err) {
    clack.log.error(err.message)
    process.exitCode = 1
    return
  }

  const scope = resolveScope({ global: isGlobal })
  const lock = scope.readLock()
  const name = resolveInstalledSkillName(lock, skillName)

  if (!name) {
    clack.outro(`"${skillName}" is not installed${isGlobal ? ' globally' : ' in this project'}.`)
    process.exitCode = 1
    return
  }

  const entry = lock.skills[name]
  const source = entry.source || 'local'

  if (source === 'local') {
    clack.log.error(
      `"${name}" was created locally — there is no source repository to open a pull request against.`,
    )
    process.exitCode = 1
    return
  }
  if (source === 'bundled') {
    clack.log.error(
      `"${name}" is a bundled starter skill that ships with dot-skills itself — push changes from the dot-skills repo instead.`,
    )
    process.exitCode = 1
    return
  }
  if (!REPO_SOURCE_RE.test(source)) {
    clack.log.error(
      `Lockfile source "${source}" is not a usable owner/repo — reinstall with \`dot-skills add\`.`,
    )
    process.exitCode = 1
    return
  }

  const localFiles = readSkillFiles(scope.skillsDir, name)
  if (!localFiles?.length) {
    clack.log.error(
      `"${name}" is missing from ${scope.skillsDir} — lockfile is stale, try \`dot-skills remove ${name}\`.`,
    )
    process.exitCode = 1
    return
  }

  const [owner, repo] = source.split('/')
  const at = `${source}${entry.branch ? `@${entry.branch}` : ''}`
  const spinner = clack.spinner()

  spinner.start(`Comparing ${name} to ${at}`)
  let remoteFiles = []
  let remoteBranch = entry.branch || null
  let remoteMissing = false

  try {
    const remote = await fetchSkillFiles({
      owner,
      repo,
      ref: entry.branch || undefined,
      skillName: name,
    })
    remoteFiles = remote.files
    remoteBranch = remote.branch
  } catch (err) {
    const message = err.message || String(err)
    if (message.startsWith('No SKILL.md found')) {
      // Skill folder removed upstream (or never published under this name) —
      // treat remote as empty so the PR recreates it.
      remoteMissing = true
      remoteFiles = []
      if (!remoteBranch) {
        try {
          remoteBranch = await getDefaultBranch(owner, repo)
        } catch (branchErr) {
          spinner.stop(`Could not reach ${at}`, 1)
          clack.log.error(describeGitHubError(branchErr, { at }))
          process.exitCode = 1
          return
        }
      }
    } else {
      spinner.stop(`Could not reach ${at}`, 1)
      clack.log.error(describeGitHubError(err, { at }))
      process.exitCode = 1
      return
    }
  }

  const localHash = hashSkillFiles(localFiles)
  const remoteHash = remoteFiles.length ? hashSkillFiles(remoteFiles) : null

  if (remoteHash && localHash === remoteHash) {
    spinner.stop(`Checked ${name} against ${at}`)
    clack.outro(`"${name}" already matches ${at} — nothing to push.`)
    return
  }

  const diff = diffSkillFiles(localFiles, remoteFiles)
  const changeCount = diff.added.length + diff.modified.length + diff.deleted.length
  spinner.stop(
    remoteMissing
      ? `"${name}" is not present at ${at} — PR will recreate it (${localFiles.length} file${localFiles.length === 1 ? '' : 's'})`
      : `Found ${changeCount} change${changeCount === 1 ? '' : 's'} vs ${at}`,
  )

  // Upstream moved since install, and local also diverged — warn before
  // overwriting the remote skill folder with the local tree.
  const divergent =
    !remoteMissing &&
    entry.contentHash &&
    localHash !== entry.contentHash &&
    remoteHash !== entry.contentHash &&
    localHash !== remoteHash

  if (divergent) {
    clack.log.warn(
      yellow(
        `"${name}" has local edits and ${at} has also changed since install. ` +
          `Pushing will replace the upstream skill folder with your local copy.`,
      ),
    )
  }

  const localSkillMd = localFiles.find((f) => f.path === 'SKILL.md')
  const localVersion = localSkillMd ? getVersion(parseSkillMd(localSkillMd.content).data) : undefined

  const summaryLines = formatDiffSummary(diff)
  if (localVersion) summaryLines.push('', dim(`local version: ${localVersion}`))
  clack.note(summaryLines.join('\n'), `Changes for ${name}`)

  const prTitle = title || defaultTitle({ skillName: name, version: localVersion })
  const prBody =
    body ||
    defaultBody({
      skillName: name,
      owner,
      repo,
      baseBranch: remoteBranch,
      diff,
      version: localVersion,
      divergent,
      remoteMissing,
    })

  const canPrompt = interactive && !force && Boolean(process.stdin.isTTY)
  if (canPrompt) {
    const answer = await clack.confirm({
      message: `Open a pull request against ${owner}/${repo}@${remoteBranch}?`,
      initialValue: true,
    })
    if (clack.isCancel(answer) || !answer) {
      clack.outro('Push cancelled.')
      return
    }
  }

  spinner.start(`Opening pull request on ${owner}/${repo}`)
  let result
  try {
    result = await createSkillPullRequest({
      owner,
      repo,
      baseBranch: remoteBranch,
      skillName: name,
      files: localFiles,
      remoteFiles,
      title: prTitle,
      body: prBody,
    })
  } catch (err) {
    spinner.stop('Failed to open pull request', 1)
    clack.log.error(describeGitHubError(err, { at }))
    process.exitCode = 1
    return
  }

  spinner.stop(`Created pull request #${result.number}`)
  await presentPullRequest({
    result,
    owner,
    repo,
    interactive,
    force,
    openUrl,
  })
}

/**
 * Print the PR URL cleanly and, on an interactive TTY, offer space to open
 * it in the browser (enter to skip).
 */
async function presentPullRequest({ result, owner, repo, interactive, force, openUrl }) {
  const lines = [underline(cyan(result.htmlUrl))]
  if (result.forked) {
    lines.push('')
    lines.push(dim(`via fork ${result.headRepo}  ·  ${owner}/${repo}`))
  }
  clack.note(lines.join('\n'), `Pull request #${result.number}`)

  const canOfferOpen = interactive && !force && Boolean(process.stdin.isTTY)
  if (!canOfferOpen) {
    clack.outro('Done')
    return
  }

  // Keep the hint on one quiet line under the note; raw mode captures the key.
  process.stdout.write(
    `  ${dim('Press')} ${bold('space')} ${dim('to open in browser')}  ${dim('·')}  ${bold('enter')} ${dim('to skip')}\n`,
  )

  const action = await waitForSpaceOrEnter()
  if (action === 'open') {
    try {
      openUrl(result.htmlUrl)
      clack.outro('Opened in browser')
    } catch (err) {
      clack.log.warn(`Could not open browser: ${err.message}`)
      clack.outro('Done')
    }
    return
  }

  clack.outro('Done')
}

function defaultTitle({ skillName, version }) {
  if (version) return `Update skill \`${skillName}\` to ${version}`
  return `Update skill \`${skillName}\` via dot-skills`
}

function defaultBody({
  skillName,
  owner,
  repo,
  baseBranch,
  diff,
  version,
  divergent,
  remoteMissing,
}) {
  const lines = [
    `This pull request updates \`.skills/${skillName}/\` from a consuming project via \`dot-skills push\`.`,
    '',
    `**Target:** \`${owner}/${repo}@${baseBranch}\`${version ? `  ·  **local version:** \`${version}\`` : ''}`,
    '',
    '### Changes',
  ]

  for (const path of diff.added) lines.push(`- added \`${path}\``)
  for (const path of diff.modified) lines.push(`- modified \`${path}\``)
  for (const path of diff.deleted) lines.push(`- deleted \`${path}\``)

  if (!diff.added.length && !diff.modified.length && !diff.deleted.length) {
    lines.push('- (file set replaced)')
  }

  if (remoteMissing) {
    lines.push('', '> The skill folder was missing upstream; this PR recreates it from the local install.')
  }
  if (divergent) {
    lines.push(
      '',
      '> **Note:** upstream also changed since this copy was installed. The PR replaces the skill folder with the local tree.',
    )
  }

  lines.push('', '---', '_Opened by [dot-skills](https://github.com/levi-putna/dot-skills)._')
  return lines.join('\n')
}

function formatDiffSummary(diff) {
  const lines = []
  for (const path of diff.added) lines.push(`${green('+')} ${path}`)
  for (const path of diff.modified) lines.push(`${yellow('~')} ${path}`)
  for (const path of diff.deleted) lines.push(`${red('-')} ${path}`)
  if (!lines.length) lines.push(dim('(no path-level diff)'))
  return lines
}

function describeGitHubError(err, { at } = {}) {
  const message = err.message || String(err)
  const first = message.split('\n')[0]

  if (message.includes('requires a GitHub token')) return message
  if (message.includes('(401)')) {
    return (
      'GitHub authentication failed — check that GITHUB_TOKEN / GH_TOKEN is valid. ' +
      'If you use the GitHub CLI: export GITHUB_TOKEN=$(gh auth token)'
    )
  }
  if (message.includes('(403)')) {
    return (
      'GitHub refused write access. Your token needs Contents + Pull requests write ' +
      `on ${at || 'the source repo'} (or permission to fork it and open a PR).`
    )
  }
  if (message.includes('(404)')) {
    return `Source ${at || 'repository'} was not found (or is private and this token cannot see it).`
  }
  if (message.includes('(422)')) {
    return `GitHub could not create the pull request: ${first}`
  }
  return first
}
