import { join, dirname } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'

// Canonical, source-of-truth skills folder inside any project.
export const SKILLS_DIR_NAME = '.skills'

export function canonicalSkillsDir(cwd) {
  return join(cwd, SKILLS_DIR_NAME)
}

export function globalSkillsRoot() {
  return join(homedir(), '.dot-skills')
}

export function canonicalGlobalSkillsDir() {
  return join(globalSkillsRoot(), 'skills')
}

// All supported coding agents and where each one looks for skills.
// `detect` checks for project-level presence in a given cwd.
export const AGENTS = {
  claude: {
    name: 'Claude Code',
    detect: (cwd) => existsSync(join(cwd, '.claude')),
    skillsDir: (cwd) => join(cwd, '.claude', 'skills'),
    globalSkillsDir: () => join(homedir(), '.claude', 'skills'),
  },
  cursor: {
    name: 'Cursor',
    detect: (cwd) => existsSync(join(cwd, '.cursor')),
    skillsDir: (cwd) => join(cwd, '.cursor', 'skills'),
    globalSkillsDir: () => join(homedir(), '.cursor', 'skills'),
  },
  copilot: {
    name: 'GitHub Copilot',
    detect: (cwd) => existsSync(join(cwd, '.github')),
    skillsDir: (cwd) => join(cwd, '.github', 'skills'),
    globalSkillsDir: () => join(homedir(), '.copilot', 'skills'),
  },
  windsurf: {
    name: 'Windsurf (Cascade)',
    detect: (cwd) => existsSync(join(cwd, '.windsurf')),
    skillsDir: (cwd) => join(cwd, '.windsurf', 'skills'),
    globalSkillsDir: () => join(homedir(), '.codeium', 'windsurf', 'skills'),
  },
  codex: {
    name: 'OpenAI Codex CLI',
    detect: (cwd) => existsSync(join(cwd, '.codex')),
    skillsDir: (cwd) => join(cwd, '.codex', 'skills'),
    globalSkillsDir: () => join(homedir(), '.codex', 'skills'),
  },
  gemini: {
    name: 'Gemini CLI',
    detect: (cwd) => existsSync(join(cwd, '.gemini')),
    skillsDir: (cwd) => join(cwd, '.gemini', 'skills'),
    globalSkillsDir: () => join(homedir(), '.gemini', 'skills'),
  },
}

export const AGENT_KEYS = Object.keys(AGENTS)

// Detect which agents already have a project-level config dir in cwd.
export function detectAgents(cwd) {
  return AGENT_KEYS.filter((key) => AGENTS[key].detect(cwd))
}

// All agents with their detection status, for interactive prompts.
export function listAgents(cwd) {
  return AGENT_KEYS.map((key) => ({
    key,
    name: AGENTS[key].name,
    detected: AGENTS[key].detect(cwd),
  }))
}

// Detect which agents have ever been used on this machine, based on the
// existence of their home-directory config folder (e.g. ~/.claude).
export function detectGlobalAgents() {
  return AGENT_KEYS.filter((key) => existsSync(dirname(AGENTS[key].globalSkillsDir())))
}

export function getAgent(key) {
  const agent = AGENTS[key]
  if (!agent) throw new Error(`Unknown agent: ${key}`)
  return agent
}
