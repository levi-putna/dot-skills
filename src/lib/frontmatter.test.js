import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMd, stringifySkillMd, validateSkillData, getDependencies } from './frontmatter.js'

test('parseSkillMd extracts frontmatter and body', () => {
  const content = `---\nname: my-skill\ndescription: does a thing\n---\n\n# Body\n\nHello.\n`
  const { data, body } = parseSkillMd(content)
  assert.equal(data.name, 'my-skill')
  assert.equal(data.description, 'does a thing')
  assert.equal(body.trim(), '# Body\n\nHello.'.trim())
})

test('parseSkillMd handles content with no frontmatter', () => {
  const { data, body } = parseSkillMd('just some text')
  assert.deepEqual(data, {})
  assert.equal(body, 'just some text')
})

test('parseSkillMd parses dependencies array', () => {
  const content = `---
name: my-skill
description: needs a key
dependencies:
  - type: env
    name: OPENAI_API_KEY
    required: true
    description: for the API
    instructions: export it
---
Body text.
`
  const { data } = parseSkillMd(content)
  assert.equal(getDependencies(data).length, 1)
  assert.equal(data.dependencies[0].name, 'OPENAI_API_KEY')
})

test('stringifySkillMd round-trips through parseSkillMd', () => {
  const original = {
    data: { name: 'my-skill', description: 'does a thing', dependencies: [{ type: 'cli', name: 'jq' }] },
    body: '# Instructions\n\nDo the thing.',
  }
  const content = stringifySkillMd(original)
  const parsed = parseSkillMd(content)
  assert.equal(parsed.data.name, 'my-skill')
  assert.equal(parsed.data.dependencies[0].name, 'jq')
  assert.equal(parsed.body.trim(), original.body)
})

test('validateSkillData flags missing name and description', () => {
  const errors = validateSkillData({})
  assert.equal(errors.length, 2)
})

test('validateSkillData flags bad dependency shape', () => {
  const errors = validateSkillData({
    name: 'x',
    description: 'y',
    dependencies: [{ name: 'FOO' }],
  })
  assert.ok(errors.some((e) => e.includes('type')))
})

test('validateSkillData passes for a well-formed skill', () => {
  const errors = validateSkillData({
    name: 'x',
    description: 'y',
    dependencies: [{ type: 'env', name: 'FOO' }],
  })
  assert.deepEqual(errors, [])
})
