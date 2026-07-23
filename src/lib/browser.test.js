import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openInBrowser, waitForSpaceOrEnter } from './browser.js'

test('openInBrowser rejects a missing url', () => {
  assert.throws(() => openInBrowser(''), /url is required/)
  assert.throws(() => openInBrowser(undefined), /url is required/)
})

test('waitForSpaceOrEnter resolves skip immediately when stdin is not a TTY', async () => {
  // In the test runner stdin is typically not a TTY.
  if (process.stdin.isTTY) return
  assert.equal(await waitForSpaceOrEnter(), 'skip')
})
