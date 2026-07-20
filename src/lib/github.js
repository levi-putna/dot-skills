const API = 'https://api.github.com'
const RAW = 'https://raw.githubusercontent.com'

function authHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
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

async function ghFetch(url) {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GitHub request failed (${res.status}) for ${url}\n${body}`.trim())
  }
  return res.json()
}

export async function getDefaultBranch(owner, repo) {
  const data = await ghFetch(`${API}/repos/${owner}/${repo}`)
  return data.default_branch
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

// Fetch every file belonging to one skill folder: [{ path (relative to skill dir), content }]
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
