import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVersion, isValidVersion, compareVersions, bumpVersion, formatVersion } from './version.js'

test('parseVersion handles full, partial, and v-prefixed versions', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] })
  assert.deepEqual(parseVersion('v2.0.0'), { major: 2, minor: 0, patch: 0, prerelease: [] })
  assert.deepEqual(parseVersion('1.2'), { major: 1, minor: 2, patch: 0, prerelease: [] })
  assert.deepEqual(parseVersion('3'), { major: 3, minor: 0, patch: 0, prerelease: [] })
  assert.deepEqual(parseVersion('1.0.0-rc.1'), { major: 1, minor: 0, patch: 0, prerelease: ['rc', '1'] })
})

test('parseVersion rejects garbage', () => {
  assert.equal(parseVersion('not-a-version'), null)
  assert.equal(parseVersion(''), null)
  assert.equal(parseVersion(undefined), null)
  assert.equal(parseVersion('1.2.3.4'), null)
})

test('isValidVersion mirrors parseVersion', () => {
  assert.equal(isValidVersion('0.1.0'), true)
  assert.equal(isValidVersion('banana'), false)
})

test('compareVersions orders releases numerically', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1)
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1)
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
})

test('compareVersions puts prereleases before their release', () => {
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1)
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1)
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0-rc.2'), -1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1)
  assert.equal(compareVersions('1.0.0-rc', '1.0.0-rc.1'), -1)
})

test('compareVersions throws on unparseable input', () => {
  assert.throws(() => compareVersions('1.0.0', 'nope'))
})

test('bumpVersion bumps major/minor/patch and clears lower parts', () => {
  assert.deepEqual(bumpVersion('1.2.3', 'patch'), {
    version: '1.2.4',
    from: '1.2.3',
    initialized: false,
  })
  assert.deepEqual(bumpVersion('1.2.3', 'minor'), {
    version: '1.3.0',
    from: '1.2.3',
    initialized: false,
  })
  assert.deepEqual(bumpVersion('1.2.3', 'major'), {
    version: '2.0.0',
    from: '1.2.3',
    initialized: false,
  })
})

test('bumpVersion initializes to 1.0.0 when no current version', () => {
  assert.deepEqual(bumpVersion(undefined, 'minor'), {
    version: '1.0.0',
    from: null,
    initialized: true,
  })
})

test('bumpVersion accepts an explicit semver value', () => {
  assert.deepEqual(bumpVersion('1.0.0', '2.3.4'), {
    version: '2.3.4',
    from: '1.0.0',
    initialized: false,
  })
  assert.deepEqual(bumpVersion(undefined, 'v1.2.3'), {
    version: '1.2.3',
    from: null,
    initialized: true,
  })
})

test('bumpVersion rejects garbage kinds', () => {
  assert.throws(() => bumpVersion('1.0.0', 'latest'))
  assert.throws(() => bumpVersion('1.0.0', ''))
})

test('formatVersion joins major.minor.patch', () => {
  assert.equal(formatVersion({ major: 1, minor: 2, patch: 3 }), '1.2.3')
})
