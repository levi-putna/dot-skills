import { spawn } from 'child_process'
import readline from 'readline'

/**
 * Open a URL in the user's default browser (macOS / Windows / Linux).
 * Fire-and-forget — does not wait for the browser to close.
 */
export function openInBrowser(url) {
  if (!url) throw new Error('url is required')

  if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
    return
  }
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
    return
  }
  spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
}

/**
 * Wait for a single keypress: space → `'open'`, enter → `'skip'`,
 * ctrl+c → `'cancel'`. Only suitable when stdin is a TTY.
 *
 * @returns {Promise<'open' | 'skip' | 'cancel'>}
 */
export function waitForSpaceOrEnter() {
  if (!process.stdin.isTTY) return Promise.resolve('skip')

  return new Promise((resolve) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    readline.emitKeypressEvents(stdin)
    stdin.resume()
    stdin.setRawMode(true)

    const done = (result) => {
      stdin.off('keypress', onKeypress)
      if (typeof wasRaw === 'boolean') stdin.setRawMode(wasRaw)
      else stdin.setRawMode(false)
      stdin.pause()
      resolve(result)
    }

    const onKeypress = (str, key) => {
      if (key?.ctrl && key.name === 'c') {
        done('cancel')
        return
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        done('skip')
        return
      }
      if (str === ' ' || key?.name === 'space') {
        done('open')
      }
    }

    stdin.on('keypress', onKeypress)
  })
}
