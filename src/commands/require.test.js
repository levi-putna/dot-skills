import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { stringifySkillMd, parseSkillMd, getRequires } from '../lib/frontmatter.js'
import { requireSkill } from './require.js'

const ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

/**
 * Write a minimal SKILL.md into a temp project's .skills/ dir.
 */
function writeSkill(skillsDir, name, data = {}) {
  const dir = join(skillsDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    stringifySkillMd({ data: { description: `skill ${name}`, name, ...data }, body: `# ${name}\n` }),
    'utf8',
  )
}

function readData(skillsDir, name) {
  return parseSkillMd(readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')).data
}

/**
 * Run `fn` with process.cwd() pointed at a fresh temp project directory
 * (mirroring how `requireSkill` resolves its scope), restoring cwd and
 * process.exitCode afterward regardless of outcome.
 */
async function withProject(fn) {
  const projectDir = mkdtempSync(join(tmpdir(), 'dot-skills-require-cmd-'))
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

test('requireSkill prints usage and exits nonzero when args are missing', async () => {
  await withProject(async () => {
    await requireSkill(undefined, undefined)
    assert.equal(process.exitCode, 1)
  })
})

test('requireSkill errors when the skill itself is not installed', async () => {
  await withProject(async () => {
    await requireSkill('root', 'helper')
    assert.equal(process.exitCode, 1)
  })
})

test('requireSkill adds a local requires entry and omits source (defaults to self)', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })
    writeSkill(skillsDir, 'helper', { id: ID_B })

    await requireSkill('root', 'helper')

    assert.notEqual(process.exitCode, 1)
    const requires = getRequires(readData(skillsDir, 'root'))
    assert.equal(requires.length, 1)
    assert.equal(requires[0].id, ID_B)
    assert.equal(requires[0].name, 'helper')
    assert.equal(requires[0].source, 'self')
    // On disk, source is omitted entirely (not written as "self").
    assert.equal(readData(skillsDir, 'root').requires[0].source, undefined)
  })
})

test('requireSkill is a no-op when the same requirement is re-added', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })
    writeSkill(skillsDir, 'helper', { id: ID_B })

    await requireSkill('root', 'helper')
    await requireSkill('root', 'helper')

    const requires = getRequires(readData(skillsDir, 'root'))
    assert.equal(requires.length, 1)
  })
})

test('requireSkill updates an existing entry when the resolved dependency changes', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })
    writeSkill(skillsDir, 'helper', { id: ID_B })

    await requireSkill('root', 'helper')
    assert.equal(getRequires(readData(skillsDir, 'root'))[0].name, 'helper')

    // Same folder, same id, but the target's own frontmatter name changed.
    writeSkill(skillsDir, 'helper', { id: ID_B, name: 'helper-renamed' })
    await requireSkill('root', 'helper')

    const requires = getRequires(readData(skillsDir, 'root'))
    assert.equal(requires.length, 1)
    assert.equal(requires[0].name, 'helper-renamed')
  })
})

test('requireSkill refuses a dependency target with no id', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })
    writeSkill(skillsDir, 'helper') // no id

    await requireSkill('root', 'helper')

    assert.equal(process.exitCode, 1)
    assert.equal(getRequires(readData(skillsDir, 'root')).length, 0)
  })
})

test('requireSkill refuses a skill requiring itself', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })

    await requireSkill('root', 'root')

    assert.equal(process.exitCode, 1)
    assert.equal(getRequires(readData(skillsDir, 'root')).length, 0)
  })
})

test('requireSkill errors when the local dependency name does not exist', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })

    await requireSkill('root', 'missing-helper')

    assert.equal(process.exitCode, 1)
    assert.equal(getRequires(readData(skillsDir, 'root')).length, 0)
  })
})

test('requireSkill resolves a remote owner/repo/skill[#ref] spec via fetch and writes id/name/source', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })

    const remoteContent = stringifySkillMd({
      data: { name: 'helper-skill', description: 'remote helper', id: ID_B },
      body: '# helper-skill\n',
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      assert.equal(
        url,
        'https://raw.githubusercontent.com/acme/skills/main/.skills/helper-skill/SKILL.md',
      )
      return { ok: true, text: async () => remoteContent }
    }
    try {
      await requireSkill('root', 'acme/skills/helper-skill#main')
    } finally {
      globalThis.fetch = originalFetch
    }

    assert.notEqual(process.exitCode, 1)
    const requires = getRequires(readData(skillsDir, 'root'))
    assert.equal(requires.length, 1)
    assert.equal(requires[0].id, ID_B)
    assert.equal(requires[0].name, 'helper-skill')
    assert.equal(requires[0].source, 'acme/skills#main')
  })
})

test('requireSkill surfaces a fetch failure for a remote spec without writing anything', async () => {
  await withProject(async (skillsDir) => {
    writeSkill(skillsDir, 'root', { id: ID_A })

    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => 'not found' })
    try {
      await requireSkill('root', 'acme/skills/helper-skill#main')
    } finally {
      globalThis.fetch = originalFetch
    }

    assert.equal(process.exitCode, 1)
    assert.equal(getRequires(readData(skillsDir, 'root')).length, 0)
  })
})
