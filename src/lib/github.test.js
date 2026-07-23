import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffSkillFiles, parseRepoSpec, requireAuthToken } from './github.js'

test('diffSkillFiles reports added, modified, and deleted paths', () => {
  const diff = diffSkillFiles(
    [
      { path: 'SKILL.md', content: 'new' },
      { path: 'references/a.md', content: 'a' },
    ],
    [
      { path: 'SKILL.md', content: 'old' },
      { path: 'scripts/run.sh', content: '#!/bin/sh' },
    ],
  )

  assert.deepEqual(diff.added, ['references/a.md'])
  assert.deepEqual(diff.modified, ['SKILL.md'])
  assert.deepEqual(diff.deleted, ['scripts/run.sh'])
})

test('diffSkillFiles treats identical trees as empty', () => {
  const files = [{ path: 'SKILL.md', content: 'same' }]
  assert.deepEqual(diffSkillFiles(files, files), { added: [], modified: [], deleted: [] })
})

test('diffSkillFiles handles missing remote as all added', () => {
  const diff = diffSkillFiles([{ path: 'SKILL.md', content: 'x' }], [])
  assert.deepEqual(diff.added, ['SKILL.md'])
  assert.deepEqual(diff.modified, [])
  assert.deepEqual(diff.deleted, [])
})

test('parseRepoSpec still parses owner/repo/skill#ref', () => {
  assert.deepEqual(parseRepoSpec('acme/skills/my-skill#main'), {
    owner: 'acme',
    repo: 'skills',
    ref: 'main',
    skillName: 'my-skill',
  })
})

test('requireAuthToken explains how to supply a token', () => {
  const prevGithub = process.env.GITHUB_TOKEN
  const prevGh = process.env.GH_TOKEN
  delete process.env.GITHUB_TOKEN
  delete process.env.GH_TOKEN
  try {
    assert.throws(() => requireAuthToken(), /GITHUB_TOKEN|GH_TOKEN|gh auth token/)
  } finally {
    if (prevGithub === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = prevGithub
    if (prevGh === undefined) delete process.env.GH_TOKEN
    else process.env.GH_TOKEN = prevGh
  }
})
