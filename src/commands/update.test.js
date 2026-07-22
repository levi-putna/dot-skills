import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, lstatSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringifySkillMd } from '../lib/frontmatter.js'
import { readLockfile, writeLockfile } from '../lib/lockfile.js'
import { hashSkillFiles } from '../lib/installer.js'
import { update } from './update.js'

const ROOT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MID_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const LEAF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

/**
 * Run `fn` with process.cwd() pointed at a fresh temp project directory
 * (mirroring how `update` resolves its scope), restoring cwd, exitCode,
 * and global.fetch afterward regardless of outcome.
 */
async function withProject(fn) {
  const projectDir = mkdtempSync(join(tmpdir(), 'dot-skills-update-cmd-'))
  const originalCwd = process.cwd()
  const originalExitCode = process.exitCode
  const originalFetch = globalThis.fetch
  process.chdir(projectDir)
  process.exitCode = undefined
  try {
    await fn(projectDir)
  } finally {
    process.chdir(originalCwd)
    process.exitCode = originalExitCode
    globalThis.fetch = originalFetch
    rmSync(projectDir, { recursive: true, force: true })
  }
}

test('update backfills a two-level requires chain and links every level into the right agents', async () => {
  await withProject(async (projectDir) => {
    // root -> requires mid (self) -> requires leaf (self); only root is
    // installed locally to start. Both mid and leaf live in the same
    // remote repo root came from, and neither is on disk yet.
    const rootContent = stringifySkillMd({
      data: { name: 'root', description: 'root skill', id: ROOT_ID, requires: [{ id: MID_ID }] },
      body: '# root\n',
    })
    const midContent = stringifySkillMd({
      data: { name: 'mid', description: 'mid skill', id: MID_ID, requires: [{ id: LEAF_ID }] },
      body: '# mid\n',
    })
    const leafContent = stringifySkillMd({
      data: { name: 'leaf', description: 'leaf skill', id: LEAF_ID },
      body: '# leaf\n',
    })

    const skillsDir = join(projectDir, '.skills')
    mkdirSync(join(skillsDir, 'root'), { recursive: true })
    writeFileSync(join(skillsDir, 'root', 'SKILL.md'), rootContent, 'utf8')

    const lock = readLockfile(projectDir)
    lock.skills.root = {
      source: 'acme/skills',
      branch: 'main',
      version: null,
      contentHash: hashSkillFiles([{ path: 'SKILL.md', content: rootContent }]),
      linkedAgents: ['claude'],
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    writeLockfile(projectDir, lock)

    const tree = {
      truncated: false,
      tree: [
        { type: 'blob', path: '.skills/root/SKILL.md' },
        { type: 'blob', path: '.skills/mid/SKILL.md' },
        { type: 'blob', path: '.skills/leaf/SKILL.md' },
      ],
    }
    const rawContents = {
      '.skills/root/SKILL.md': rootContent,
      '.skills/mid/SKILL.md': midContent,
      '.skills/leaf/SKILL.md': leafContent,
    }

    globalThis.fetch = async (url) => {
      const u = String(url)
      if (u.includes('api.github.com') && u.includes('/git/trees/')) {
        return { ok: true, json: async () => tree }
      }
      if (u.startsWith('https://raw.githubusercontent.com/acme/skills/main/')) {
        const path = u.slice('https://raw.githubusercontent.com/acme/skills/main/'.length)
        const content = rawContents[path]
        if (content === undefined) return { ok: false, status: 404, text: async () => 'not found' }
        return { ok: true, text: async () => content }
      }
      throw new Error(`Unexpected fetch in test: ${u}`)
    }

    await update(undefined, {})

    assert.notEqual(process.exitCode, 1)

    // Both newly-discovered levels of the chain landed in .skills/...
    assert.ok(existsSync(join(skillsDir, 'mid', 'SKILL.md')), 'mid should be installed')
    assert.ok(existsSync(join(skillsDir, 'leaf', 'SKILL.md')), 'leaf should be installed')

    // ...and, critically, both are actually linked into claude — not just
    // the direct dependency (mid), but the leaf two levels down too.
    const claudeSkills = join(projectDir, '.claude', 'skills')
    assert.ok(lstatSync(join(claudeSkills, 'mid')).isSymbolicLink(), 'mid should be linked into claude')
    assert.ok(lstatSync(join(claudeSkills, 'leaf')).isSymbolicLink(), 'leaf should be linked into claude')

    const finalLock = readLockfile(projectDir)
    assert.deepEqual(finalLock.skills.mid.linkedAgents, ['claude'])
    assert.deepEqual(finalLock.skills.leaf.linkedAgents, ['claude'])
  })
})
