import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'
import { parseSkillMd, getId } from './frontmatter.js'

// Absolute path to the dot-skills package root (works whether run via npx
// from the npm registry cache, or locally from a checkout).
export const PACKAGE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

// The package's own .skills/ folder ships the starter meta-skills and
// doubles as a normal dot-skills source repo (`dot-skills add levi-putna/dot-skills`).
export const BUNDLED_SKILLS_DIR = join(PACKAGE_ROOT, '.skills')

export const BUNDLED_META_SKILLS = ['dotskills-create-skill', 'dotskills-import-skill']

// The bundled meta-skills' real ids, read from the shipped SKILL.md files
// themselves rather than duplicated as a second hardcoded copy here — that
// would risk drifting out of sync if a skill's id ever needed correcting.
// Used to exclude them from `dot-skills list <repo>` (see list.js): every
// project that ran `init` carries its own copy of these two, so listing
// them as if they were repo-specific content would be noise, and matching
// by id (not name) means the exclusion still works even if a copy gets
// renamed.
export function getBundledMetaSkillIds() {
  return BUNDLED_META_SKILLS.map((name) => {
    const content = readFileSync(join(BUNDLED_SKILLS_DIR, name, 'SKILL.md'), 'utf8')
    return getId(parseSkillMd(content).data)
  }).filter(Boolean)
}
