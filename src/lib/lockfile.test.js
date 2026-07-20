import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLockfile, writeLockfile, recordSkill, removeSkillRecord, getProjectLockfilePath } from './lockfile.js'

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dot-skills-lock-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('readLockfile returns empty shape when no file exists', () => {
  withTmpDir((dir) => {
    const lock = readLockfile(dir)
    assert.deepEqual(lock, { skills: {} })
  })
})

test('writeLockfile then readLockfile round-trips', () => {
  withTmpDir((dir) => {
    writeLockfile(dir, { skills: { foo: { source: 'local' } } })
    const lock = readLockfile(dir)
    assert.equal(lock.skills.foo.source, 'local')
    assert.ok(existsSync(getProjectLockfilePath(dir)))
  })
})

test('recordSkill adds a skill entry with timestamps', () => {
  const lock = { skills: {} }
  recordSkill(lock, 'my-skill', {
    source: 'owner/repo',
    branch: 'main',
    linkedAgents: ['claude'],
  })
  assert.equal(lock.skills['my-skill'].source, 'owner/repo')
  assert.equal(lock.skills['my-skill'].branch, 'main')
  assert.deepEqual(lock.skills['my-skill'].linkedAgents, ['claude'])
  assert.ok(lock.skills['my-skill'].installedAt)
  assert.ok(lock.skills['my-skill'].updatedAt)
  assert.equal(lock.skills['my-skill'].dependencies, undefined)
})

test('recordSkill preserves original installedAt on update', () => {
  const lock = { skills: {} }
  recordSkill(lock, 'my-skill', { source: 'a', linkedAgents: [] })
  const firstInstalledAt = lock.skills['my-skill'].installedAt
  recordSkill(lock, 'my-skill', { source: 'a', linkedAgents: ['cursor'] })
  assert.equal(lock.skills['my-skill'].installedAt, firstInstalledAt)
  assert.deepEqual(lock.skills['my-skill'].linkedAgents, ['cursor'])
})

test('removeSkillRecord deletes the entry', () => {
  const lock = { skills: { foo: {} } }
  removeSkillRecord(lock, 'foo')
  assert.deepEqual(lock.skills, {})
})
