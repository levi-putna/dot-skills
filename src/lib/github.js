import { parseSkillMd, getId } from './frontmatter.js'

const API = 'https://api.github.com'
const RAW = 'https://raw.githubusercontent.com'

/**
 * Return the configured GitHub token, or null if none is set.
 */
export function getAuthToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null
}

/**
 * Require a GitHub token for write operations (push / PR).
 * @returns {string}
 */
export function requireAuthToken() {
  const token = getAuthToken()
  if (!token) {
    throw new Error(
      'Pushing a skill requires a GitHub token. Set GITHUB_TOKEN or GH_TOKEN ' +
        '(Contents + Pull requests write on the source repo, or a classic token with ' +
        '`public_repo` / `repo` scope). If you use the GitHub CLI: ' +
        'export GITHUB_TOKEN=$(gh auth token)',
    )
  }
  return token
}

function authHeaders({ requireToken = false } = {}) {
  if (requireToken) requireAuthToken()
  const token = getAuthToken()
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'dot-skills-cli' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

// Parse "owner/repo", "owner/repo#branch", or "owner/repo/skill-name" into parts.
export function parseRepoSpec(spec) {
  const [repoPart, ref] = spec.split('#')
  const segments = repoPart.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error(`Invalid repo spec "${spec}" — expected "owner/repo" or "owner/repo/skill-name"`)
  }
  const [owner, repo, ...rest] = segments
  const skillName = rest.length ? rest.join('/') : undefined
  return { owner, repo, ref, skillName }
}

/**
 * Low-level GitHub API request. Throws on non-2xx with status + body.
 */
async function ghRequest(url, { method = 'GET', body, requireToken = false } = {}) {
  const headers = authHeaders({ requireToken })
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub request failed (${res.status}) for ${url}\n${text}`.trim())
  }
  if (res.status === 204) return null
  // Default to JSON for API responses. Headers may be absent in tests that
  // stub fetch with a minimal mock.
  const contentType =
    typeof res.headers?.get === 'function' ? res.headers.get('content-type') || '' : ''
  if (!contentType || contentType.includes('application/json')) return res.json()
  return res.text()
}

async function ghFetch(url) {
  return ghRequest(url)
}

export async function getDefaultBranch(owner, repo) {
  const data = await ghFetch(`${API}/repos/${owner}/${repo}`)
  return data.default_branch
}

/**
 * Fetch repository metadata (including permissions for the authenticated user).
 */
export async function getRepo(owner, repo) {
  return ghRequest(`${API}/repos/${owner}/${repo}`, { requireToken: Boolean(getAuthToken()) })
}

/**
 * Return the authenticated GitHub user (requires a token).
 */
export async function getAuthenticatedUser() {
  return ghRequest(`${API}/user`, { requireToken: true })
}

// Full recursive tree of the repo at ref, filtered to blobs under .skills/
export async function getSkillsTree({ owner, repo, ref }) {
  const branch = ref || (await getDefaultBranch(owner, repo))
  const data = await ghFetch(`${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
  if (data.truncated) {
    throw new Error(`Repo tree for ${owner}/${repo}@${branch} was truncated by GitHub's API (too large to list in one call)`)
  }
  const entries = (data.tree || []).filter((e) => e.type === 'blob' && e.path.startsWith('.skills/'))
  return { branch, entries }
}

// List available skill names (folders directly under .skills/ containing a SKILL.md).
export async function listSkillNames({ owner, repo, ref }) {
  const { branch, entries } = await getSkillsTree({ owner, repo, ref })
  const names = new Set()
  for (const entry of entries) {
    const match = /^\.skills\/([^/]+)\/SKILL\.md$/.exec(entry.path)
    if (match) names.add(match[1])
  }
  return { branch, names: [...names].sort() }
}

export function rawUrl({ owner, repo, ref, path }) {
  return `${RAW}/${owner}/${repo}/${ref}/${path}`
}

export async function fetchRawText({ owner, repo, ref, path }) {
  const res = await fetch(rawUrl({ owner, repo, ref, path }), { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch ${path} from ${owner}/${repo}@${ref} (${res.status})`)
  return res.text()
}

/**
 * Fetch every file belonging to one skill folder:
 * [{ path (relative to skill dir), content }]
 */
export async function fetchSkillFiles({ owner, repo, ref, skillName }) {
  const { branch, entries } = await getSkillsTree({ owner, repo, ref })
  const prefix = `.skills/${skillName}/`
  const files = entries.filter((e) => e.path.startsWith(prefix))
  if (!files.some((f) => f.path === `${prefix}SKILL.md`)) {
    throw new Error(`No SKILL.md found at ${prefix}SKILL.md in ${owner}/${repo}@${branch}`)
  }
  const results = []
  for (const file of files) {
    const content = await fetchRawText({ owner, repo, ref: branch, path: file.path })
    results.push({ path: file.path.slice(prefix.length), content })
  }
  return { branch, files: results }
}

/**
 * Find a skill in a repo by its stable `id` UUID.
 * Tries `nameHint` first (one fetch); on miss/mismatch, scans every SKILL.md
 * under `.skills/`. Returns { branch, skillName, data, content } or throws.
 */
export async function findSkillById({ owner, repo, ref, id, nameHint } = {}) {
  const { branch, names } = await listSkillNames({ owner, repo, ref })

  const tryName = async (skillName) => {
    try {
      const content = await fetchRawText({
        owner,
        repo,
        ref: branch,
        path: `.skills/${skillName}/SKILL.md`,
      })
      const { data } = parseSkillMd(content)
      if (getId(data) === id) {
        return { branch, skillName, data, content }
      }
    } catch {
      // Name hint missed or skill folder missing — fall through to full scan.
    }
    return null
  }

  if (nameHint) {
    const hit = await tryName(nameHint)
    if (hit) return hit
  }

  for (const skillName of names) {
    if (skillName === nameHint) continue
    const hit = await tryName(skillName)
    if (hit) return hit
  }

  throw new Error(
    `No skill with id "${id}" found in ${owner}/${repo}@${branch}` +
      (nameHint ? ` (also tried name hint "${nameHint}")` : ''),
  )
}

/**
 * Compare local vs remote skill files. Paths are relative to the skill dir.
 * @returns {{ added: string[], modified: string[], deleted: string[] }}
 */
export function diffSkillFiles(localFiles, remoteFiles) {
  const localMap = new Map((localFiles || []).map((f) => [f.path, f.content]))
  const remoteMap = new Map((remoteFiles || []).map((f) => [f.path, f.content]))
  const added = []
  const modified = []
  const deleted = []

  for (const [path, content] of localMap) {
    if (!remoteMap.has(path)) added.push(path)
    else if (remoteMap.get(path) !== content) modified.push(path)
  }
  for (const path of remoteMap.keys()) {
    if (!localMap.has(path)) deleted.push(path)
  }

  added.sort()
  modified.sort()
  deleted.sort()
  return { added, modified, deleted }
}

/**
 * Resolve where commits should land: the source repo if the token can push,
 * otherwise a fork of it (created if missing).
 */
export async function resolvePushTarget({ owner, repo }) {
  requireAuthToken()
  const info = await ghRequest(`${API}/repos/${owner}/${repo}`, { requireToken: true })

  if (info.permissions?.push) {
    return {
      headOwner: owner,
      headRepo: repo,
      baseOwner: owner,
      baseRepo: repo,
      defaultBranch: info.default_branch,
      forked: false,
    }
  }

  const fork = await ghRequest(`${API}/repos/${owner}/${repo}/forks`, {
    method: 'POST',
    requireToken: true,
  })
  const headOwner = fork.owner.login
  const headRepo = fork.name
  await waitForRepo({ owner: headOwner, repo: headRepo })

  return {
    headOwner,
    headRepo,
    baseOwner: owner,
    baseRepo: repo,
    defaultBranch: info.default_branch,
    forked: true,
  }
}

/**
 * Commit local skill files onto a new branch and open a pull request against
 * the upstream base branch. Does not require git or the gh CLI — uses the
 * GitHub Git Data + Pulls APIs.
 *
 * @returns {{ htmlUrl: string, number: number, headBranch: string, baseBranch: string, forked: boolean, headRepo: string }}
 */
export async function createSkillPullRequest({
  owner,
  repo,
  baseBranch,
  skillName,
  files,
  remoteFiles = [],
  title,
  body,
  headBranch,
} = {}) {
  requireAuthToken()
  if (!skillName) throw new Error('skillName is required')
  if (!files?.length) throw new Error('files is required')

  const target = await resolvePushTarget({ owner, repo })
  const base = baseBranch || target.defaultBranch
  const branch =
    headBranch ||
    `dot-skills/push-${String(skillName).replace(/\//g, '-')}-${Date.now().toString(36)}`

  const baseSha = await getRefSha({
    owner: target.baseOwner,
    repo: target.baseRepo,
    branch: base,
  })

  // Prefer reading the commit via the head repo (works for same-repo and
  // forks that already share the object); fall back to the base repo.
  const baseCommit = await getCommitWithFallback({
    headOwner: target.headOwner,
    headRepo: target.headRepo,
    baseOwner: target.baseOwner,
    baseRepo: target.baseRepo,
    sha: baseSha,
  })

  await createRef({
    owner: target.headOwner,
    repo: target.headRepo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  })

  const prefix = `.skills/${skillName}/`
  const treeItems = []

  for (const file of files) {
    const blob = await ghRequest(`${API}/repos/${target.headOwner}/${target.headRepo}/git/blobs`, {
      method: 'POST',
      requireToken: true,
      body: { content: file.content, encoding: 'utf-8' },
    })
    treeItems.push({
      path: `${prefix}${file.path}`,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    })
  }

  const localPaths = new Set(files.map((f) => f.path))
  for (const remote of remoteFiles) {
    if (!localPaths.has(remote.path)) {
      // sha: null deletes the path from the tree relative to base_tree
      treeItems.push({
        path: `${prefix}${remote.path}`,
        mode: '100644',
        type: 'blob',
        sha: null,
      })
    }
  }

  const newTree = await ghRequest(`${API}/repos/${target.headOwner}/${target.headRepo}/git/trees`, {
    method: 'POST',
    requireToken: true,
    body: {
      base_tree: baseCommit.tree.sha,
      tree: treeItems,
    },
  })

  const commitMessage =
    title || `Update skill \`${skillName}\` via dot-skills`

  const commit = await ghRequest(`${API}/repos/${target.headOwner}/${target.headRepo}/git/commits`, {
    method: 'POST',
    requireToken: true,
    body: {
      message: commitMessage,
      tree: newTree.sha,
      parents: [baseSha],
    },
  })

  await ghRequest(
    `${API}/repos/${target.headOwner}/${target.headRepo}/git/refs/heads/${branch
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    {
      method: 'PATCH',
      requireToken: true,
      body: { sha: commit.sha, force: false },
    },
  )

  const head = target.forked ? `${target.headOwner}:${branch}` : branch
  const pr = await ghRequest(`${API}/repos/${target.baseOwner}/${target.baseRepo}/pulls`, {
    method: 'POST',
    requireToken: true,
    body: {
      title: commitMessage,
      body: body || '',
      head,
      base,
    },
  })

  return {
    htmlUrl: pr.html_url,
    number: pr.number,
    headBranch: branch,
    baseBranch: base,
    forked: target.forked,
    headRepo: `${target.headOwner}/${target.headRepo}`,
  }
}

async function getRefSha({ owner, repo, branch }) {
  const encoded = branch
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  const data = await ghRequest(`${API}/repos/${owner}/${repo}/git/ref/heads/${encoded}`, {
    requireToken: true,
  })
  return data.object.sha
}

async function getCommitWithFallback({ headOwner, headRepo, baseOwner, baseRepo, sha }) {
  try {
    return await ghRequest(`${API}/repos/${headOwner}/${headRepo}/git/commits/${sha}`, {
      requireToken: true,
    })
  } catch (err) {
    if (headOwner === baseOwner && headRepo === baseRepo) throw err
    return ghRequest(`${API}/repos/${baseOwner}/${baseRepo}/git/commits/${sha}`, {
      requireToken: true,
    })
  }
}

async function createRef({ owner, repo, ref, sha }) {
  return ghRequest(`${API}/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    requireToken: true,
    body: { ref, sha },
  })
}

/**
 * Poll until a newly created fork is readable via the API.
 */
async function waitForRepo({ owner, repo, attempts = 10, delayMs = 1000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      await ghRequest(`${API}/repos/${owner}/${repo}`, { requireToken: true })
      return
    } catch (err) {
      const message = err.message || ''
      if (!message.includes('(404)') || i === attempts - 1) throw err
      await sleep(delayMs)
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
