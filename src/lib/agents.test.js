import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AGENTS, AGENT_KEYS, detectAgents, listAgents, canonicalSkillsDir, getAgent } from './agents.js'

test('AGENTS covers all 6 target coding agents', () => {
  assert.deepEqual(AGENT_KEYS.sort(), ['claude', 'codex', 'copilot', 'cursor', 'gemini', 'windsurf'].sort())
})

test('each agent defines project and global skill dirs', () => {
  const cwd = '/tmp/example'
  for (const key of AGENT_KEYS) {
    const agent = AGENTS[key]
    assert.equal(typeof agent.skillsDir(cwd), 'string')
    assert.equal(typeof agent.globalSkillsDir(), 'string')
    assert.ok(agent.skillsDir(cwd).endsWith(join('skills')))
  }
})

test('detectAgents only returns agents whose config dir exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dot-skills-test-'))
  try {
    mkdirSync(join(dir, '.claude'))
    mkdirSync(join(dir, '.cursor'))
    assert.deepEqual(detectAgents(dir).sort(), ['claude', 'cursor'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('listAgents marks detected flag correctly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dot-skills-test-'))
  try {
    mkdirSync(join(dir, '.windsurf'))
    const agents = listAgents(dir)
    const windsurf = agents.find((a) => a.key === 'windsurf')
    const cursor = agents.find((a) => a.key === 'cursor')
    assert.equal(windsurf.detected, true)
    assert.equal(cursor.detected, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('canonicalSkillsDir points at .skills under cwd', () => {
  assert.equal(canonicalSkillsDir('/repo'), join('/repo', '.skills'))
})

test('getAgent throws for unknown agent key', () => {
  assert.throws(() => getAgent('nonexistent'))
})
