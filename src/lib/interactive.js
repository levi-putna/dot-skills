import * as clack from '@clack/prompts'
import { listAgents, AGENT_KEYS } from './agents.js'

// Prompt the user to pick which agents to act on, pre-checking any detected
// in the current project. Returns an array of agent keys, or `null` if the
// user cancelled (callers should bail out cleanly in that case).
//
// Non-interactive escape hatches (for scripts/CI, and detected automatically
// when stdin isn't a TTY): pass `explicit` (an array of agent keys, e.g. from
// a parsed `--agents=claude,cursor` flag) or `all: true` to skip the prompt.
export async function pickAgents(cwd, { message = 'Which coding agents?', explicit, all } = {}) {
  if (all) return [...AGENT_KEYS]
  if (explicit) return explicit.filter((key) => AGENT_KEYS.includes(key))

  const agents = listAgents(cwd)

  if (!process.stdin.isTTY) {
    // No terminal to prompt in — fall back to whatever was auto-detected.
    return agents.filter((a) => a.detected).map((a) => a.key)
  }

  const result = await clack.multiselect({
    message,
    options: agents.map((a) => ({
      value: a.key,
      label: a.name,
      hint: a.detected ? 'detected' : undefined,
    })),
    initialValues: agents.filter((a) => a.detected).map((a) => a.key),
    required: false,
  })
  if (clack.isCancel(result)) {
    clack.cancel('Cancelled.')
    return null
  }
  return result
}
