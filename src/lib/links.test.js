import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyLink, auditLinks, fixLinks } from './links.js'
import { writeSkillFiles, linkSkill } from './installer.js'

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dot-skills-links-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('classifyLink reports ok for a correct symlink', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const agentDir = join(dir, '.claude', 'skills')
    linkSkill(join(skillsDir, 'my-skill'), agentDir, 'my-skill')

    assert.deepEqual(classifyLink({ skillsDir, skillName: 'my-skill', agentDir }), { status: 'ok' })
  })
})

test('classifyLink reports missing when nothing is there', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const agentDir = join(dir, '.claude', 'skills')
    mkdirSync(agentDir, { recursive: true })

    assert.deepEqual(classifyLink({ skillsDir, skillName: 'my-skill', agentDir }), { status: 'missing' })
  })
})

test('classifyLink reports broken for a dangling symlink', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const agentDir = join(dir, '.claude', 'skills')
    mkdirSync(agentDir, { recursive: true })
    symlinkSync(join(dir, 'nowhere'), join(agentDir, 'my-skill'), 'junction')

    assert.deepEqual(classifyLink({ skillsDir, skillName: 'my-skill', agentDir }), { status: 'broken' })
  })
})

test('classifyLink reports wrong-target for a symlink pointing elsewhere', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const elsewhere = join(dir, 'elsewhere')
    mkdirSync(elsewhere, { recursive: true })
    const agentDir = join(dir, '.claude', 'skills')
    mkdirSync(agentDir, { recursive: true })
    symlinkSync(elsewhere, join(agentDir, 'my-skill'), 'junction')

    const result = classifyLink({ skillsDir, skillName: 'my-skill', agentDir })
    assert.equal(result.status, 'wrong-target')
  })
})

test('classifyLink reports copy for a matching non-symlink fallback', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const agentDir = join(dir, '.claude', 'skills')
    writeSkillFiles(agentDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])

    assert.deepEqual(classifyLink({ skillsDir, skillName: 'my-skill', agentDir }), { status: 'copy' })
  })
})

test('classifyLink reports stale-copy when contents differ', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'v2' }])
    const agentDir = join(dir, '.claude', 'skills')
    writeSkillFiles(agentDir, 'my-skill', [{ path: 'SKILL.md', content: 'v1' }])

    assert.deepEqual(classifyLink({ skillsDir, skillName: 'my-skill', agentDir }), { status: 'stale-copy' })
  })
})

test('auditLinks flags missing links even for an agent whose skills dir was never created', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const claudeDir = join(dir, '.claude', 'skills')
    mkdirSync(claudeDir, { recursive: true })
    // cursor's skills dir doesn't exist at all yet — still a "never linked" issue, not something to stay quiet about.
    const cursorDir = join(dir, '.cursor', 'skills')

    const issues = auditLinks({
      skillsDir,
      agentKeys: ['claude', 'cursor'],
      agentSkillsDir: (key) => (key === 'claude' ? claudeDir : cursorDir),
    })

    assert.deepEqual(
      issues.sort((a, b) => a.agentKey.localeCompare(b.agentKey)),
      [
        { skillName: 'my-skill', agentKey: 'claude', status: 'missing' },
        { skillName: 'my-skill', agentKey: 'cursor', status: 'missing' },
      ],
    )
  })
})

test('auditLinks omits correctly linked skills', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const claudeDir = join(dir, '.claude', 'skills')
    linkSkill(join(skillsDir, 'my-skill'), claudeDir, 'my-skill')

    const issues = auditLinks({
      skillsDir,
      agentKeys: ['claude'],
      agentSkillsDir: () => claudeDir,
    })

    assert.deepEqual(issues, [])
  })
})

test('auditLinks flags orphaned links with no matching skill folder left', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    mkdirSync(skillsDir, { recursive: true })
    const claudeDir = join(dir, '.claude', 'skills')
    writeSkillFiles(claudeDir, 'ghost-skill', [{ path: 'SKILL.md', content: 'x' }])

    const issues = auditLinks({
      skillsDir,
      agentKeys: ['claude'],
      agentSkillsDir: () => claudeDir,
    })

    assert.deepEqual(issues, [{ skillName: 'ghost-skill', agentKey: 'claude', status: 'orphan' }])
  })
})

test('fixLinks repairs a missing link and removes an orphan', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const claudeDir = join(dir, '.claude', 'skills')
    mkdirSync(claudeDir, { recursive: true })
    writeSkillFiles(claudeDir, 'ghost-skill', [{ path: 'SKILL.md', content: 'x' }])

    const issues = auditLinks({
      skillsDir,
      agentKeys: ['claude'],
      agentSkillsDir: () => claudeDir,
    })
    assert.equal(issues.length, 2)

    const fixed = fixLinks(issues, { skillsDir, agentSkillsDir: () => claudeDir })
    assert.equal(fixed.length, 2)

    const remaining = auditLinks({
      skillsDir,
      agentKeys: ['claude'],
      agentSkillsDir: () => claudeDir,
    })
    assert.deepEqual(remaining, [])
  })
})

test('fixLinks re-links a broken symlink', () => {
  withTmpDir((dir) => {
    const skillsDir = join(dir, '.skills')
    writeSkillFiles(skillsDir, 'my-skill', [{ path: 'SKILL.md', content: 'x' }])
    const claudeDir = join(dir, '.claude', 'skills')
    mkdirSync(claudeDir, { recursive: true })
    symlinkSync(join(dir, 'nowhere'), join(claudeDir, 'my-skill'), 'junction')

    const issues = auditLinks({ skillsDir, agentKeys: ['claude'], agentSkillsDir: () => claudeDir })
    assert.equal(issues[0].status, 'broken')

    fixLinks(issues, { skillsDir, agentSkillsDir: () => claudeDir })

    const remaining = auditLinks({ skillsDir, agentKeys: ['claude'], agentSkillsDir: () => claudeDir })
    assert.deepEqual(remaining, [])
  })
})
