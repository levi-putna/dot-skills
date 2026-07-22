import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { stringifySkillMd, parseSkillMd, getVersion } from '../lib/frontmatter.js'
import { version } from './version.js'

/**
 * Write a minimal SKILL.md into a temp project's .skills/ dir.
 */
function writeSkill(skillsDir, name, data = {}) {
  const dir = join(skillsDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    stringifySkillMd({ data: { description: `skill ${name}`, ...data, name }, body: `# ${name}\n` }),
    'utf8',
  )
}

function readData(skillsDir, name) {
  return parseSkillMd(readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')).data
}

/**
 * Run `fn` with process.cwd() pointed at a fresh temp project directory
 * (mirroring how the `version` command resolves its scope), restoring cwd
 * and process.exitCode afterward regardless of outcome.
 */
async function withProject(fn) {
  const projectDir = mkdtempSync(join(tmpdir(), 'dot-skills-version-cmd-'))
  const skillsDir = join(projectDir, '.skills')
  mkdirSync(skillsDir, { recursive: true })
  const originalCwd = process.cwd()
  const originalExitCode = process.exitCode
  process.chdir(projectDir)
  process.exitCode = undefined
  try {
    await fn(skillsDir)
  } finally {
    process.chdir(originalCwd)
    process.exitCode = originalExitCode
    rmSync(projectDir, { recursive: true, force: true })
  }
}

test('version prints usage and exits nonzero when args are missing', async () => {
  await withProject(async () => {
    await version(undefined, undefined)
    assert.equal(process.exitCode, 1)
  })
})

test('version errors when the skill is not installed', async () => {
  await withProject(async () => {
    await version('my-skill', 'minor')
    assert.equal(process.exitCode, 1)
  })
})

test('version bumps by kind and writes the result to SKILL.md', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'my-skill', { version: '1.2.3' })

    await version('my-skill', 'minor')

    assert.notEqual(process.exitCode, 1)
    assert.equal(getVersion(readData(skillsDir, 'my-skill')), '1.3.0')
  })
})

test('version initializes a missing version to 1.0.0', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'my-skill')

    await version('my-skill', 'patch')

    assert.equal(getVersion(readData(skillsDir, 'my-skill')), '1.0.0')
  })
})

test('version accepts an explicit semver value', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'my-skill', { version: '1.0.0' })

    await version('my-skill', '2.5.0')

    assert.equal(getVersion(readData(skillsDir, 'my-skill')), '2.5.0')
  })
})

test('version rejects an invalid kind/value and leaves the file untouched', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'my-skill', { version: '1.0.0' })

    await version('my-skill', 'not-a-version')

    assert.equal(process.exitCode, 1)
    assert.equal(getVersion(readData(skillsDir, 'my-skill')), '1.0.0')
  })
})

test('version is a no-op when the requested value equals the current version', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'my-skill', { version: '1.2.3' })

    await version('my-skill', '1.2.3')

    assert.notEqual(process.exitCode, 1)
    assert.equal(getVersion(readData(skillsDir, 'my-skill')), '1.2.3')
  })
})

test('version still applies (with a warning) when explicitly set older than the current version', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'my-skill', { version: '2.0.0' })

    await version('my-skill', '1.0.0')

    assert.notEqual(process.exitCode, 1)
    assert.equal(getVersion(readData(skillsDir, 'my-skill')), '1.0.0')
  })
})
