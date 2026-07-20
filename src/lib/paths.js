import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Absolute path to the dot-skills package root (works whether run via npx
// from the npm registry cache, or locally from a checkout).
export const PACKAGE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

// The package's own .skills/ folder ships the starter meta-skills and
// doubles as a normal dot-skills source repo (`dot-skills add levi-putna/dot-skills`).
export const BUNDLED_SKILLS_DIR = join(PACKAGE_ROOT, '.skills')

export const BUNDLED_META_SKILLS = ['creating-skills', 'importing-skills']
