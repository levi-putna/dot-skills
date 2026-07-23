import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringifySkillMd } from '../lib/frontmatter.js'
import { readLockfile, writeLockfile } from '../lib/lockfile.js'
import { hashSkillFiles } from '../lib/installer.js'
import { push } from './push.js'

const SKILL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

/**
 * Run `fn` in a temp project with cwd / fetch / env / exitCode restored.
 */
async function withProject(fn) {
  const projectDir = mkdtempSync(join(tmpdir(), 'dot-skills-push-cmd-'))
  const originalCwd = process.cwd()
  const originalExitCode = process.exitCode
  const originalFetch = globalThis.fetch
  const originalGithub = process.env.GITHUB_TOKEN
  const originalGh = process.env.GH_TOKEN
  process.chdir(projectDir)
  process.exitCode = undefined
  try {
    await fn(projectDir)
  } finally {
    process.chdir(originalCwd)
    process.exitCode = originalExitCode
    globalThis.fetch = originalFetch
    if (originalGithub === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = originalGithub
    if (originalGh === undefined) delete process.env.GH_TOKEN
    else process.env.GH_TOKEN = originalGh
    rmSync(projectDir, { recursive: true, force: true })
  }
}

function installLocalSkill(projectDir, { content, source = 'acme/skills', branch = 'main' }) {
  const skillsDir = join(projectDir, '.skills')
  mkdirSync(join(skillsDir, 'demo-skill'), { recursive: true })
  writeFileSync(join(skillsDir, 'demo-skill', 'SKILL.md'), content, 'utf8')

  const lock = readLockfile(projectDir)
  lock.skills['demo-skill'] = {
    source,
    branch,
    version: null,
    contentHash: hashSkillFiles([{ path: 'SKILL.md', content }]),
    linkedAgents: ['claude'],
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  writeLockfile(projectDir, lock)
}

test('push fails clearly when no GitHub token is configured', async () => {
  await withProject(async (projectDir) => {
    delete process.env.GITHUB_TOKEN
    delete process.env.GH_TOKEN

    const content = stringifySkillMd({
      data: { name: 'demo-skill', description: 'demo', id: SKILL_ID, version: '1.0.0' },
      body: '# demo\n',
    })
    installLocalSkill(projectDir, { content })

    await push('demo-skill', { force: true, interactive: false })
    assert.equal(process.exitCode, 1)
  })
})

test('push reports nothing to push when local matches upstream', async () => {
  await withProject(async (projectDir) => {
    process.env.GITHUB_TOKEN = 'test-token'

    const content = stringifySkillMd({
      data: { name: 'demo-skill', description: 'demo', id: SKILL_ID, version: '1.0.0' },
      body: '# demo\n',
    })
    installLocalSkill(projectDir, { content })

    globalThis.fetch = async (url) => {
      const u = String(url)
      if (u.includes('/git/trees/')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            truncated: false,
            tree: [{ type: 'blob', path: '.skills/demo-skill/SKILL.md' }],
          }),
        }
      }
      if (u.startsWith('https://raw.githubusercontent.com/acme/skills/main/')) {
        return {
          ok: true,
          headers: { get: () => 'text/plain' },
          text: async () => content,
        }
      }
      throw new Error(`Unexpected fetch in test: ${u}`)
    }

    await push('demo-skill', { force: true, interactive: false })
    assert.equal(process.exitCode, undefined)
  })
})

test('push opens a pull request for local edits via the GitHub API', async () => {
  await withProject(async (projectDir) => {
    process.env.GITHUB_TOKEN = 'test-token'

    const remoteContent = stringifySkillMd({
      data: { name: 'demo-skill', description: 'demo', id: SKILL_ID, version: '1.0.0' },
      body: '# demo\n',
    })
    const localContent = stringifySkillMd({
      data: { name: 'demo-skill', description: 'demo improved', id: SKILL_ID, version: '1.1.0' },
      body: '# demo improved\n',
    })
    installLocalSkill(projectDir, { content: remoteContent })
    writeFileSync(join(projectDir, '.skills', 'demo-skill', 'SKILL.md'), localContent, 'utf8')

    const calls = []
    const baseSha = 'aaa111'
    const treeSha = 'tree111'
    const blobSha = 'blob111'
    const newTreeSha = 'tree222'
    const commitSha = 'ccc222'

    globalThis.fetch = async (url, options = {}) => {
      const u = String(url)
      const method = options.method || 'GET'
      calls.push({ method, url: u, body: options.body ? JSON.parse(options.body) : undefined })

      const json = (data, status = 200) => ({
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => 'application/json' },
        json: async () => data,
        text: async () => JSON.stringify(data),
      })

      if (method === 'GET' && u.includes('/git/trees/')) {
        return json({
          truncated: false,
          tree: [{ type: 'blob', path: '.skills/demo-skill/SKILL.md' }],
        })
      }
      if (method === 'GET' && u.startsWith('https://raw.githubusercontent.com/')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'text/plain' },
          text: async () => remoteContent,
        }
      }
      if (method === 'GET' && u.endsWith('/repos/acme/skills')) {
        return json({
          default_branch: 'main',
          permissions: { push: true },
        })
      }
      if (method === 'GET' && u.includes('/git/ref/heads/main')) {
        return json({ object: { sha: baseSha } })
      }
      if (method === 'GET' && u.includes(`/git/commits/${baseSha}`)) {
        return json({ sha: baseSha, tree: { sha: treeSha } })
      }
      if (method === 'POST' && u.endsWith('/git/refs')) {
        return json({ ref: 'refs/heads/x', object: { sha: baseSha } }, 201)
      }
      if (method === 'POST' && u.endsWith('/git/blobs')) {
        return json({ sha: blobSha }, 201)
      }
      if (method === 'POST' && u.endsWith('/git/trees')) {
        assert.equal(calls.at(-1).body.base_tree, treeSha)
        assert.ok(calls.at(-1).body.tree.some((t) => t.path === '.skills/demo-skill/SKILL.md'))
        return json({ sha: newTreeSha }, 201)
      }
      if (method === 'POST' && u.endsWith('/git/commits')) {
        return json({ sha: commitSha }, 201)
      }
      if (method === 'PATCH' && u.includes('/git/refs/heads/')) {
        assert.equal(calls.at(-1).body.sha, commitSha)
        return json({ object: { sha: commitSha } })
      }
      if (method === 'POST' && u.endsWith('/pulls')) {
        const body = calls.at(-1).body
        assert.equal(body.base, 'main')
        assert.match(body.title, /demo-skill/)
        return json(
          {
            html_url: 'https://github.com/acme/skills/pull/42',
            number: 42,
          },
          201,
        )
      }

      throw new Error(`Unexpected fetch in test: ${method} ${u}`)
    }

    await push('demo-skill', {
      force: true,
      interactive: false,
      title: 'Update skill `demo-skill` to 1.1.0',
    })

    assert.equal(process.exitCode, undefined)
    assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/pulls')))
  })
})

test('push rejects locally created skills with no source repo', async () => {
  await withProject(async (projectDir) => {
    process.env.GITHUB_TOKEN = 'test-token'

    const content = stringifySkillMd({
      data: { name: 'demo-skill', description: 'demo', id: SKILL_ID },
      body: '# demo\n',
    })
    installLocalSkill(projectDir, { content, source: 'local', branch: null })

    await push('demo-skill', { force: true, interactive: false })
    assert.equal(process.exitCode, 1)
  })
})
