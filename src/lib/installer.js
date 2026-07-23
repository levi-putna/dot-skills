import { mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync, lstatSync, cpSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { getDependencies } from './frontmatter.js'
import { wrap, NOTE_BOX_OVERHEAD } from './format.js'

// Write a skill's files into <skillsDir>/<skillName>/...
export function writeSkillFiles(skillsDir, skillName, files) {
  const skillDir = join(skillsDir, skillName)
  mkdirSync(skillDir, { recursive: true })
  for (const file of files) {
    const dest = join(skillDir, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, file.content, 'utf8')
  }
  return skillDir
}

// Read every file in an installed skill folder back as [{ path, content }],
// with paths relative to the skill dir — the same shape fetchSkillFiles
// returns, so the two sides can be hashed and compared.
export function readSkillFiles(skillsDir, skillName) {
  const skillDir = join(skillsDir, skillName)
  if (!existsSync(skillDir)) return null
  const files = []
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel)
      } else if (entry.isFile()) {
        files.push({ path: rel, content: readFileSync(join(dir, entry.name), 'utf8') })
      }
    }
  }
  walk(skillDir, '')
  return files
}

// Stable fingerprint of a skill's contents (order-independent), stored in
// the lockfile at install time so `update` can tell local edits apart from
// upstream changes.
export function hashSkillFiles(files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(file.content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

// Link (or copy, if symlinks aren't available) canonicalSkillDir into agentSkillsDir/skillName.
// Returns { mode: 'symlink' | 'copy', path }.
export function linkSkill(canonicalSkillDir, agentSkillsDir, skillName) {
  const linkPath = join(agentSkillsDir, skillName)
  mkdirSync(agentSkillsDir, { recursive: true })

  if (existsSync(linkPath) || isBrokenSymlink(linkPath)) {
    rmSync(linkPath, { recursive: true, force: true })
  }

  try {
    symlinkSync(canonicalSkillDir, linkPath, 'junction')
    return { mode: 'symlink', path: linkPath }
  } catch {
    copyDir(canonicalSkillDir, linkPath)
    return { mode: 'copy', path: linkPath }
  }
}

export function unlinkSkill(agentSkillsDir, skillName) {
  const linkPath = join(agentSkillsDir, skillName)
  if (!existsSync(linkPath) && !isBrokenSymlink(linkPath)) return false
  rmSync(linkPath, { recursive: true, force: true })
  return true
}

export function removeCanonicalSkill(skillsDir, skillName) {
  const skillDir = join(skillsDir, skillName)
  if (!existsSync(skillDir)) return false
  rmSync(skillDir, { recursive: true, force: true })
  return true
}

function isBrokenSymlink(path) {
  try {
    lstatSync(path)
    return !existsSync(path)
  } catch {
    return false
  }
}

function copyDir(src, dest) {
  cpSync(src, dest, { recursive: true })
}

// Format a human-readable post-install notice for a skill's declared dependencies.
export function formatDependencyNotice(skillName, data) {
  const deps = getDependencies(data)
  if (!deps.length) return null

  const lines = [`Skill "${skillName}" needs setup before it will work:`]
  for (const dep of deps) {
    const req = dep.required === false ? 'optional' : 'required'
    const kind = dep.type === 'cli' ? 'CLI tool' : 'environment variable'
    lines.push('')
    lines.push(`  [${req}] ${kind}: ${dep.name}`)
    // Author-supplied free text (often a full sentence or a URL) — wrap it
    // to the terminal width so this note's box doesn't blow past it.
    if (dep.description) lines.push(wrap(dep.description, { indent: 4, boxOverhead: NOTE_BOX_OVERHEAD }))
    if (dep.instructions) {
      lines.push(wrap(`-> ${dep.instructions}`, { indent: 4, boxOverhead: NOTE_BOX_OVERHEAD }))
    }
  }
  return lines.join('\n')
}

// Check which declared dependencies are currently satisfied on this machine.
// Only checks `env` dependencies deterministically; `cli` deps are reported as unknown.
export function checkDependencies(data) {
  const deps = getDependencies(data)
  return deps.map((dep) => {
    if (dep.type === 'env') {
      return { ...dep, satisfied: Boolean(process.env[dep.name]) }
    }
    return { ...dep, satisfied: undefined }
  })
}
