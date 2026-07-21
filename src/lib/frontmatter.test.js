import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMd, stringifySkillMd, validateSkillData, getDependencies, getId, getAuthor, getRepo } from './frontmatter.js'

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

test('validateSkillData accepts a well-formed UUID id', () => {
  const errors = validateSkillData({ name: 'x', description: 'y', id: '56824965-a4de-4b74-bf8d-5d04b598de77' })
  assert.deepEqual(errors, [])
})

test('validateSkillData flags a malformed id', () => {
  const errors = validateSkillData({ name: 'x', description: 'y', id: 'not-a-uuid' })
  assert.ok(errors.some((e) => e.includes('id')))
})

test('getId returns the id when present and a string', () => {
  assert.equal(getId({ id: '56824965-a4de-4b74-bf8d-5d04b598de77' }), '56824965-a4de-4b74-bf8d-5d04b598de77')
  assert.equal(getId({}), undefined)
  assert.equal(getId({ id: 123 }), undefined)
})

test('validateSkillData accepts author and repo when well-formed', () => {
  const errors = validateSkillData({
    name: 'x',
    description: 'y',
    author: 'Levi Putna',
    repo: 'https://github.com/levi-putna/dot-skills',
  })
  assert.deepEqual(errors, [])
})

test('validateSkillData flags a non-string author', () => {
  const errors = validateSkillData({ name: 'x', description: 'y', author: 42 })
  assert.ok(errors.some((e) => e.includes('author')))
})

test('validateSkillData flags a repo that is not a URL', () => {
  const errors = validateSkillData({ name: 'x', description: 'y', repo: 'levi-putna/dot-skills' })
  assert.ok(errors.some((e) => e.includes('repo')))
})

test('getAuthor and getRepo return the value only when present and a string', () => {
  assert.equal(getAuthor({ author: 'Levi Putna' }), 'Levi Putna')
  assert.equal(getAuthor({}), undefined)
  assert.equal(getRepo({ repo: 'https://github.com/levi-putna/dot-skills' }), 'https://github.com/levi-putna/dot-skills')
  assert.equal(getRepo({ repo: 123 }), undefined)
})
