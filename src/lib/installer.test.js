import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  writeSkillFiles,
  linkSkill,
  unlinkSkill,
  removeCanonicalSkill,
  formatDependencyNotice,
  checkDependencies,
} from './installer.js'

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dot-skills-installer-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('writeSkillFiles creates nested files under skillsDir/name', () => {
  withTmpDir((dir) => {
    const skillDir = writeSkillFiles(dir, 'my-skill', [
      { path: 'SKILL.md', content: '---\nname: my-skill\n---\nbody' },
      { path: 'references/notes.md', content: 'notes' },
    ])
    assert.equal(skillDir, join(dir, 'my-skill'))
    assert.equal(readFileSync(join(dir, 'my-skill', 'SKILL.md'), 'utf8'), '---\nname: my-skill\n---\nbody')
    assert.equal(readFileSync(join(dir, 'my-skill', 'references', 'notes.md'), 'utf8'), 'notes')
  })
})

test('linkSkill symlinks the canonical dir into the agent dir', () => {
  withTmpDir((dir) => {
    const canonical = writeSkillFiles(join(dir, '.skills'), 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const agentSkills = join(dir, '.claude', 'skills')
    const result = linkSkill(canonical, agentSkills, 'my-skill')

    assert.equal(result.mode, 'symlink')
    assert.ok(existsSync(join(agentSkills, 'my-skill', 'SKILL.md')))
    assert.ok(lstatSync(join(agentSkills, 'my-skill')).isSymbolicLink())
  })
})

test('linkSkill replaces an existing link idempotently', () => {
  withTmpDir((dir) => {
    const canonical = writeSkillFiles(join(dir, '.skills'), 'my-skill', [{ path: 'SKILL.md', content: 'v1' }])
    const agentSkills = join(dir, '.cursor', 'skills')
    linkSkill(canonical, agentSkills, 'my-skill')
    linkSkill(canonical, agentSkills, 'my-skill') // should not throw on re-link
    assert.ok(existsSync(join(agentSkills, 'my-skill', 'SKILL.md')))
  })
})

test('unlinkSkill removes the link and reports whether it existed', () => {
  withTmpDir((dir) => {
    const canonical = writeSkillFiles(join(dir, '.skills'), 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const agentSkills = join(dir, '.claude', 'skills')
    linkSkill(canonical, agentSkills, 'my-skill')

    assert.equal(unlinkSkill(agentSkills, 'my-skill'), true)
    assert.equal(existsSync(join(agentSkills, 'my-skill')), false)
    assert.equal(unlinkSkill(agentSkills, 'my-skill'), false)
  })
})

test('removeCanonicalSkill deletes the source folder', () => {
  withTmpDir((dir) => {
    writeSkillFiles(dir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    assert.equal(removeCanonicalSkill(dir, 'my-skill'), true)
    assert.equal(existsSync(join(dir, 'my-skill')), false)
    assert.equal(removeCanonicalSkill(dir, 'my-skill'), false)
  })
})

test('formatDependencyNotice returns null when no dependencies declared', () => {
  assert.equal(formatDependencyNotice('my-skill', {}), null)
})

test('formatDependencyNotice renders required and optional dependencies', () => {
  const notice = formatDependencyNotice('my-skill', {
    dependencies: [
      { type: 'env', name: 'OPENAI_API_KEY', required: true, description: 'for the API', instructions: 'export it' },
      { type: 'cli', name: 'jq', required: false, instructions: 'brew install jq' },
    ],
  })
  assert.match(notice, /OPENAI_API_KEY/)
  assert.match(notice, /required/)
  assert.match(notice, /optional/)
  assert.match(notice, /brew install jq/)
})

test('checkDependencies reports env var satisfaction from process.env', () => {
  process.env.DOT_SKILLS_TEST_VAR = '1'
  const results = checkDependencies({
    dependencies: [
      { type: 'env', name: 'DOT_SKILLS_TEST_VAR' },
      { type: 'env', name: 'DOT_SKILLS_MISSING_VAR' },
      { type: 'cli', name: 'jq' },
    ],
  })
  delete process.env.DOT_SKILLS_TEST_VAR
  assert.equal(results[0].satisfied, true)
  assert.equal(results[1].satisfied, false)
  assert.equal(results[2].satisfied, undefined)
})
