import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseSkillMd, getId, getRequires } from './frontmatter.js'
import { parseRepoSpec, findSkillById, fetchSkillFiles } from './github.js'
import { wrap, NOTE_BOX_OVERHEAD } from './format.js'

/**
 * Scan an installed skills directory and return maps of id->name and name->id.
 */
export function collectInstalledSkills(skillsDir) {
  const byId = new Map()
  const byName = new Map()
  if (!existsSync(skillsDir)) return { byId, byName }

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md')
    let id
    if (existsSync(skillMdPath)) {
      id = getId(parseSkillMd(readFileSync(skillMdPath, 'utf8')).data)
    }
    byName.set(entry.name, id || null)
    if (id) byId.set(id, entry.name)
  }
  return { byId, byName }
}

/**
 * Normalize a requires source against the parent skill's own provenance.
 * Returns { kind: 'self-local' } | { kind: 'remote', owner, repo, ref, label }.
 */
export function resolveRequiresSource({ source, parentSource } = {}) {
  const normalized = !source || source === 'self' ? 'self' : source

  if (normalized === 'self') {
    if (parentSource && parentSource.kind === 'remote') {
      return {
        kind: 'remote',
        owner: parentSource.owner,
        repo: parentSource.repo,
        ref: parentSource.ref,
        label: `${parentSource.owner}/${parentSource.repo}` +
          (parentSource.ref ? `#${parentSource.ref}` : ''),
      }
    }
    return { kind: 'self-local', label: 'self' }
  }

  const parsed = parseRepoSpec(normalized)
  return {
    kind: 'remote',
    owner: parsed.owner,
    repo: parsed.repo,
    ref: parsed.ref,
    // Prefer the skill-name segment from the source when present as a hint
    nameHint: parsed.skillName,
    label: `${parsed.owner}/${parsed.repo}` + (parsed.ref ? `#${parsed.ref}` : ''),
  }
}

/**
 * Build a comparable key for conflict detection across source declarations.
 */
export function sourceKey(resolved) {
  if (resolved.kind === 'self-local') return 'self'
  return `${resolved.owner}/${resolved.repo}` + (resolved.ref ? `#${resolved.ref}` : '')
}

/**
 * Resolve a full dependency tree for one or more root skills.
 *
 * @param {Array<{ skillName: string, data: object, parentSource: object }>} roots
 *   Each root is a skill about to be (or already) installed, with its
 *   frontmatter `data` and provenance `parentSource`
 *   (`{ kind: 'remote', owner, repo, ref }` or `{ kind: 'local' }`).
 * @param {{ skillsDir: string, findSkillByIdFn?: Function, fetchSkillFilesFn?: Function }} options
 * @returns {Promise<{ toInstall: Array, alreadyInstalled: Array }>}
 */
export async function resolveDependencyTree(
  roots,
  { skillsDir, findSkillByIdFn = findSkillById, fetchSkillFilesFn = fetchSkillFiles } = {},
) {
  const installed = collectInstalledSkills(skillsDir)
  const seenSources = new Map() // id -> { key, requiredBy }
  const toInstall = []
  const alreadyInstalled = []
  const queued = new Set() // ids already scheduled for install this run

  // Seed seenSources with already-installed skills so conflicts against them
  // are caught, and so we can skip re-fetching.
  for (const [id, name] of installed.byId) {
    seenSources.set(id, { key: 'installed', requiredBy: name, skillName: name })
  }

  async function visit({ skillName, data, parentSource }, path) {
    const requires = getRequires(data)
    for (const req of requires) {
      if (path.includes(req.id)) {
        const chain = [...path, req.id].map((id) => {
          const known = seenSources.get(id)
          return known?.skillName || id
        })
        throw new Error(`Circular skill dependency: ${chain.join(' -> ')}`)
      }

      const resolved = resolveRequiresSource({
        source: req.source,
        parentSource,
      })
      const key = sourceKey(resolved)
      const nameHint = req.name || resolved.nameHint

      const existing = seenSources.get(req.id)
      if (existing) {
        // Already installed — nothing to fetch. Compatible re-declaration from
        // the same source (or another root that already queued it) is a no-op.
        if (existing.key === 'installed') {
          alreadyInstalled.push({
            id: req.id,
            skillName: existing.skillName,
            requiredBy: skillName,
            sourceLabel: 'already installed',
          })
          continue
        }
        if (existing.key === key) {
          continue
        }
        // Same id claimed from two different sources — hard error.
        throw new Error(
          `Conflicting sources for skill id "${req.id}": ` +
            `"${skillName}" wants ${key}, but "${existing.requiredBy}" already resolved it from ${existing.key}`,
        )
      }

      // Resolve the skill's actual folder name + frontmatter.
      let resolvedSkill
      if (resolved.kind === 'self-local') {
        resolvedSkill = resolveLocalById({
          skillsDir,
          id: req.id,
          nameHint,
          requiredBy: skillName,
        })
      } else {
        const found = await findSkillByIdFn({
          owner: resolved.owner,
          repo: resolved.repo,
          ref: resolved.ref,
          id: req.id,
          nameHint,
        })
        resolvedSkill = {
          skillName: found.skillName,
          data: found.data,
          branch: found.branch,
          owner: resolved.owner,
          repo: resolved.repo,
        }
      }

      // Name collision: a different skill already occupies this folder name.
      const occupyingId = installed.byName.get(resolvedSkill.skillName)
      if (occupyingId !== undefined && occupyingId !== req.id && occupyingId !== null) {
        throw new Error(
          `Cannot install "${resolvedSkill.skillName}" (id ${req.id}): ` +
            `that name is already used locally by a different skill (id ${occupyingId})`,
        )
      }
      if (occupyingId === null && !installed.byId.has(req.id)) {
        // Folder exists with no id — treat as a name collision for safety.
        throw new Error(
          `Cannot install "${resolvedSkill.skillName}" (id ${req.id}): ` +
            `that name is already used locally by a skill with no id`,
        )
      }

      if (queued.has(req.id)) continue
      queued.add(req.id)
      seenSources.set(req.id, {
        key,
        requiredBy: skillName,
        skillName: resolvedSkill.skillName,
      })

      const nextParentSource =
        resolved.kind === 'remote'
          ? {
              kind: 'remote',
              owner: resolvedSkill.owner,
              repo: resolvedSkill.repo,
              ref: resolvedSkill.branch || resolved.ref,
            }
          : { kind: 'local' }

      // Recurse into the dependency's own requires first (dependency-first order).
      await visit(
        {
          skillName: resolvedSkill.skillName,
          data: resolvedSkill.data,
          parentSource: nextParentSource,
        },
        [...path, req.id],
      )

      // Fetch files for remote deps; local/self skills are already on disk.
      let files = null
      if (resolved.kind === 'remote') {
        ;({ files } = await fetchSkillFilesFn({
          owner: resolvedSkill.owner,
          repo: resolvedSkill.repo,
          ref: resolvedSkill.branch || resolved.ref,
          skillName: resolvedSkill.skillName,
        }))
      }

      toInstall.push({
        id: req.id,
        skillName: resolvedSkill.skillName,
        data: resolvedSkill.data,
        files,
        requiredBy: skillName,
        sourceLabel: key,
        lockSource:
          resolved.kind === 'remote'
            ? `${resolvedSkill.owner}/${resolvedSkill.repo}`
            : 'local',
        branch: resolvedSkill.branch || resolved.ref || null,
        parentSource: nextParentSource,
      })
    }
  }

  for (const root of roots) {
    const rootId = getId(root.data)
    if (rootId) {
      seenSources.set(rootId, {
        key: root.parentSource?.kind === 'remote'
          ? `${root.parentSource.owner}/${root.parentSource.repo}` +
            (root.parentSource.ref ? `#${root.parentSource.ref}` : '')
          : 'self',
        requiredBy: root.skillName,
        skillName: root.skillName,
      })
    }
    await visit(root, rootId ? [rootId] : [])
  }

  return { toInstall, alreadyInstalled }
}

/**
 * Resolve a `self` dependency against the local skills directory.
 */
function resolveLocalById({ skillsDir, id, nameHint, requiredBy }) {
  if (nameHint) {
    const skillMdPath = join(skillsDir, nameHint, 'SKILL.md')
    if (existsSync(skillMdPath)) {
      const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
      if (getId(data) === id) {
        return { skillName: nameHint, data }
      }
    }
  }

  if (!existsSync(skillsDir)) {
    throw new Error(
      `Skill "${requiredBy}" requires id "${id}" from the same repo, ` +
        `but ${skillsDir} does not exist`,
    )
  }

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === nameHint) continue
    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue
    const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
    if (getId(data) === id) {
      return { skillName: entry.name, data }
    }
  }

  throw new Error(
    `Skill "${requiredBy}" requires id "${id}"` +
      (nameHint ? ` (name hint "${nameHint}")` : '') +
      ` from the same repo, but it is not present in ${skillsDir}`,
  )
}

/**
 * Find installed skills that declare a requires entry pointing at `targetId`.
 */
export function findDependents({ skillsDir, targetId, excludeName } = {}) {
  const dependents = []
  if (!existsSync(skillsDir) || !targetId) return dependents

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === excludeName) continue
    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue
    const { data } = parseSkillMd(readFileSync(skillMdPath, 'utf8'))
    const requires = getRequires(data)
    if (requires.some((req) => req.id === targetId)) {
      dependents.push({ skillName: entry.name, data })
    }
  }
  return dependents
}

/**
 * Check which declared `requires` entries are currently installed.
 * Returns [{ id, name, source, skillName?, satisfied }].
 */
export function checkRequires(data, { skillsDir } = {}) {
  const installed = collectInstalledSkills(skillsDir)
  return getRequires(data).map((req) => {
    const skillName = installed.byId.get(req.id)
    return {
      ...req,
      skillName: skillName || req.name,
      satisfied: Boolean(skillName),
    }
  })
}

/**
 * Build an `add`-compatible install spec from a requires entry.
 * Stored sources are `owner/repo` or `owner/repo#ref` (no skill segment);
 * insert the skill name before any `#ref`. Hand-edited sources that already
 * include a skill path are returned unchanged so we don't double the name.
 */
export function formatRequiresAddSpec(req) {
  const skill = req.name || req.skillName || req.id
  if (!skill) return null
  if (!req.source || req.source === 'self') {
    return `<owner/repo>/${skill}`
  }

  const raw = String(req.source)
  const [repoPart, ref] = raw.split('#')
  const segments = repoPart.split('/').filter(Boolean)
  if (segments.length >= 3) return raw
  return `${repoPart}/${skill}${ref ? `#${ref}` : ''}`
}

/**
 * Format a human-readable list of skills about to be installed as dependencies.
 */
export function formatRequiresInstallList(toInstall) {
  if (!toInstall.length) return null
  const lines = ['Also installing:']
  for (const item of toInstall) {
    const via = item.requiredBy ? `, required by ${item.requiredBy}` : ''
    lines.push(
      wrap(`${item.skillName}  (${item.sourceLabel}${via})`, { indent: 2, boxOverhead: NOTE_BOX_OVERHEAD }),
    )
  }
  return lines.join('\n')
}
