import { mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync, lstatSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { getDependencies } from './frontmatter.js'

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
    if (dep.description) lines.push(`    ${dep.description}`)
    if (dep.instructions) lines.push(`    -> ${dep.instructions}`)
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
