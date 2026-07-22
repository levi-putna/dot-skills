import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  collectInstalledSkills,
  resolveRequiresSource,
  sourceKey,
  resolveDependencyTree,
  findDependents,
  checkRequires,
  formatRequiresInstallList,
} from './deps.js'
import { stringifySkillMd } from './frontmatter.js'

const ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ID_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ID_D = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

/**
 * Write a minimal SKILL.md into a temp skills dir.
 */
function writeSkill(skillsDir, name, { id, requires } = {}) {
  const dir = join(skillsDir, name)
  mkdirSync(dir, { recursive: true })
  const data = {
    name,
    description: `skill ${name}`,
  }
  if (id) data.id = id
  if (requires) data.requires = requires
  writeFileSync(
    join(dir, 'SKILL.md'),
    stringifySkillMd({ data, body: `# ${name}\n` }),
    'utf8',
  )
  return data
}

function makeTempSkillsDir() {
  return mkdtempSync(join(tmpdir(), 'dot-skills-deps-'))
}

test('resolveRequiresSource treats missing and self as self-local when parent is local', () => {
  assert.deepEqual(resolveRequiresSource({ source: undefined, parentSource: { kind: 'local' } }), {
    kind: 'self-local',
    label: 'self',
  })
  assert.deepEqual(resolveRequiresSource({ source: 'self', parentSource: { kind: 'local' } }), {
    kind: 'self-local',
    label: 'self',
  })
})

test('resolveRequiresSource expands self against a remote parent', () => {
  const resolved = resolveRequiresSource({
    source: 'self',
    parentSource: { kind: 'remote', owner: 'acme', repo: 'skills', ref: 'main' },
  })
  assert.equal(resolved.kind, 'remote')
  assert.equal(resolved.owner, 'acme')
  assert.equal(resolved.repo, 'skills')
  assert.equal(resolved.ref, 'main')
  assert.equal(resolved.label, 'acme/skills#main')
})

test('resolveRequiresSource parses an explicit owner/repo source', () => {
  const resolved = resolveRequiresSource({
    source: 'other/repo#dev',
    parentSource: { kind: 'local' },
  })
  assert.equal(resolved.kind, 'remote')
  assert.equal(resolved.label, 'other/repo#dev')
  assert.equal(sourceKey(resolved), 'other/repo#dev')
})

test('collectInstalledSkills and checkRequires report satisfied status', () => {
  const skillsDir = makeTempSkillsDir()
  try {
    writeSkill(skillsDir, 'helper', { id: ID_B })
    writeSkill(skillsDir, 'root', {
      id: ID_A,
      requires: [{ id: ID_B, name: 'helper' }, { id: ID_C, name: 'missing' }],
    })
    const installed = collectInstalledSkills(skillsDir)
    assert.equal(installed.byId.get(ID_B), 'helper')
    assert.equal(installed.byName.get('helper'), ID_B)

    const rootData = { requires: [{ id: ID_B, name: 'helper' }, { id: ID_C, name: 'missing' }] }
    const status = checkRequires(rootData, { skillsDir })
    assert.equal(status[0].satisfied, true)
    assert.equal(status[1].satisfied, false)
  } finally {
    rmSync(skillsDir, { recursive: true, force: true })
  }
})

test('findDependents returns skills that require a given id', () => {
  const skillsDir = makeTempSkillsDir()
  try {
    writeSkill(skillsDir, 'helper', { id: ID_B })
    writeSkill(skillsDir, 'root', {
      id: ID_A,
      requires: [{ id: ID_B, name: 'helper' }],
    })
    writeSkill(skillsDir, 'other', { id: ID_C })
    const deps = findDependents({ skillsDir, targetId: ID_B, excludeName: 'helper' })
    assert.equal(deps.length, 1)
    assert.equal(deps[0].skillName, 'root')
  } finally {
    rmSync(skillsDir, { recursive: true, force: true })
  }
})

test('resolveDependencyTree skips already-installed self deps', async () => {
  const skillsDir = makeTempSkillsDir()
  try {
    const helperData = writeSkill(skillsDir, 'helper', { id: ID_B })
    const rootData = writeSkill(skillsDir, 'root', {
      id: ID_A,
      requires: [{ id: ID_B, name: 'helper' }],
    })
    const { toInstall, alreadyInstalled } = await resolveDependencyTree(
      [{ skillName: 'root', data: rootData, parentSource: { kind: 'local' } }],
      { skillsDir },
    )
    assert.equal(toInstall.length, 0)
    assert.equal(alreadyInstalled.length, 1)
    assert.equal(alreadyInstalled[0].skillName, 'helper')
    assert.equal(helperData.id, ID_B)
  } finally {
    rmSync(skillsDir, { recursive: true, force: true })
  }
})

test('resolveDependencyTree detects cycles', async () => {
  const skillsDir = makeTempSkillsDir()
  try {
    // A requires B, B requires A — both on disk so self-local resolution works.
    const dataA = writeSkill(skillsDir, 'skill-a', {
      id: ID_A,
      requires: [{ id: ID_B, name: 'skill-b' }],
    })
    writeSkill(skillsDir, 'skill-b', {
      id: ID_B,
      requires: [{ id: ID_A, name: 'skill-a' }],
    })

    // Pretend neither is "already installed" by using an empty skills dir for
    // the install scan, but still resolve self against a lookup dir via custom
    // find — simpler: seed only A as root with parent local, and have B not
    // in installed. For cycle detection with self-local, both need to be
    // findable but not pre-seeded as installed. Use a separate empty dir for
    // "installed" by resolving against a dir that has both folders — they
    // WILL be marked installed. So instead use remote mocks for the cycle.
    const catalog = {
      [ID_A]: {
        skillName: 'skill-a',
        data: dataA,
        branch: 'main',
      },
      [ID_B]: {
        skillName: 'skill-b',
        data: {
          name: 'skill-b',
          description: 'b',
          id: ID_B,
          requires: [{ id: ID_A, name: 'skill-a', source: 'acme/skills' }],
        },
        branch: 'main',
      },
    }

    await assert.rejects(
      () =>
        resolveDependencyTree(
          [
            {
              skillName: 'skill-a',
              data: {
                ...dataA,
                requires: [{ id: ID_B, name: 'skill-b', source: 'acme/skills' }],
              },
              parentSource: { kind: 'remote', owner: 'acme', repo: 'skills', ref: 'main' },
            },
          ],
          {
            skillsDir: makeTempSkillsDir(), // empty — nothing installed
            findSkillByIdFn: async ({ id }) => {
              const hit = catalog[id]
              if (!hit) throw new Error(`missing ${id}`)
              return { ...hit, data: hit.data }
            },
            fetchSkillFilesFn: async ({ skillName }) => ({
              branch: 'main',
              files: [{ path: 'SKILL.md', content: `# ${skillName}\n` }],
            }),
          },
        ),
      /Circular skill dependency/,
    )
  } finally {
    rmSync(skillsDir, { recursive: true, force: true })
  }
})

test('resolveDependencyTree hard-errors on conflicting sources for the same id', async () => {
  const emptyDir = makeTempSkillsDir()
  try {
    await assert.rejects(
      () =>
        resolveDependencyTree(
          [
            {
              skillName: 'root-one',
              data: {
                name: 'root-one',
                description: 'r1',
                id: ID_A,
                requires: [{ id: ID_B, name: 'helper', source: 'acme/one' }],
              },
              parentSource: { kind: 'remote', owner: 'acme', repo: 'one', ref: 'main' },
            },
            {
              skillName: 'root-two',
              data: {
                name: 'root-two',
                description: 'r2',
                id: ID_C,
                requires: [{ id: ID_B, name: 'helper', source: 'acme/two' }],
              },
              parentSource: { kind: 'remote', owner: 'acme', repo: 'two', ref: 'main' },
            },
          ],
          {
            skillsDir: emptyDir,
            findSkillByIdFn: async ({ id, owner, repo }) => ({
              branch: 'main',
              skillName: 'helper',
              data: { name: 'helper', description: 'h', id },
              // echo owner/repo so callers see different sources
              owner,
              repo,
            }),
            fetchSkillFilesFn: async () => ({
              branch: 'main',
              files: [{ path: 'SKILL.md', content: '---\nname: helper\ndescription: h\n---\n' }],
            }),
          },
        ),
      /Conflicting sources/,
    )
  } finally {
    rmSync(emptyDir, { recursive: true, force: true })
  }
})

test('resolveDependencyTree installs a remote chain in dependency-first order', async () => {
  const emptyDir = makeTempSkillsDir()
  try {
    const catalog = {
      [ID_B]: {
        skillName: 'mid',
        data: {
          name: 'mid',
          description: 'm',
          id: ID_B,
          requires: [{ id: ID_C, name: 'leaf', source: 'acme/skills' }],
        },
        branch: 'main',
      },
      [ID_C]: {
        skillName: 'leaf',
        data: { name: 'leaf', description: 'l', id: ID_C },
        branch: 'main',
      },
    }

    const { toInstall } = await resolveDependencyTree(
      [
        {
          skillName: 'root',
          data: {
            name: 'root',
            description: 'r',
            id: ID_A,
            requires: [{ id: ID_B, name: 'mid', source: 'acme/skills' }],
          },
          parentSource: { kind: 'remote', owner: 'acme', repo: 'skills', ref: 'main' },
        },
      ],
      {
        skillsDir: emptyDir,
        findSkillByIdFn: async ({ id }) => {
          const hit = catalog[id]
          if (!hit) throw new Error(`missing ${id}`)
          return { ...hit }
        },
        fetchSkillFilesFn: async ({ skillName }) => ({
          branch: 'main',
          files: [{ path: 'SKILL.md', content: `# ${skillName}\n` }],
        }),
      },
    )

    assert.deepEqual(
      toInstall.map((i) => i.skillName),
      ['leaf', 'mid'],
    )
  } finally {
    rmSync(emptyDir, { recursive: true, force: true })
  }
})

test('resolveDependencyTree expands self against the parent remote repo', async () => {
  const emptyDir = makeTempSkillsDir()
  try {
    const { toInstall } = await resolveDependencyTree(
      [
        {
          skillName: 'root',
          data: {
            name: 'root',
            description: 'r',
            id: ID_A,
            requires: [{ id: ID_B, name: 'helper' }], // source omitted => self
          },
          parentSource: { kind: 'remote', owner: 'acme', repo: 'skills', ref: 'main' },
        },
      ],
      {
        skillsDir: emptyDir,
        findSkillByIdFn: async ({ owner, repo, id, nameHint }) => {
          assert.equal(owner, 'acme')
          assert.equal(repo, 'skills')
          assert.equal(id, ID_B)
          assert.equal(nameHint, 'helper')
          return {
            branch: 'main',
            skillName: 'helper',
            data: { name: 'helper', description: 'h', id: ID_B },
          }
        },
        fetchSkillFilesFn: async () => ({
          branch: 'main',
          files: [{ path: 'SKILL.md', content: '# helper\n' }],
        }),
      },
    )
    assert.equal(toInstall.length, 1)
    assert.equal(toInstall[0].skillName, 'helper')
    assert.equal(toInstall[0].sourceLabel, 'acme/skills#main')
  } finally {
    rmSync(emptyDir, { recursive: true, force: true })
  }
})

test('resolveDependencyTree hard-errors on local name collision with a different id', async () => {
  const skillsDir = makeTempSkillsDir()
  try {
    writeSkill(skillsDir, 'helper', { id: ID_D }) // occupies the name with a different id
    await assert.rejects(
      () =>
        resolveDependencyTree(
          [
            {
              skillName: 'root',
              data: {
                name: 'root',
                description: 'r',
                id: ID_A,
                requires: [{ id: ID_B, name: 'helper', source: 'acme/skills' }],
              },
              parentSource: { kind: 'remote', owner: 'acme', repo: 'skills', ref: 'main' },
            },
          ],
          {
            skillsDir,
            findSkillByIdFn: async () => ({
              branch: 'main',
              skillName: 'helper',
              data: { name: 'helper', description: 'h', id: ID_B },
            }),
            fetchSkillFilesFn: async () => ({
              branch: 'main',
              files: [{ path: 'SKILL.md', content: '# helper\n' }],
            }),
          },
        ),
      /already used locally by a different skill/,
    )
  } finally {
    rmSync(skillsDir, { recursive: true, force: true })
  }
})

test('formatRequiresInstallList renders a readable summary', () => {
  const text = formatRequiresInstallList([
    { skillName: 'helper', sourceLabel: 'acme/skills', requiredBy: 'root' },
  ])
  assert.match(text, /Also installing/)
  assert.match(text, /helper/)
  assert.match(text, /required by root/)
  assert.equal(formatRequiresInstallList([]), null)
})
