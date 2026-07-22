// Loose semver handling with no dependency: optional "v" prefix, one to
// three numeric parts (missing parts default to 0), optional prerelease.
const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

// Parse a version string into { major, minor, patch, prerelease[] }, or
// null when the string isn't a recognisable version.
export function parseVersion(input) {
  if (typeof input !== 'string') return null
  const match = VERSION_RE.exec(input.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

export function isValidVersion(input) {
  return parseVersion(input) !== null
}

// Semver precedence: -1 when a < b, 0 when equal, 1 when a > b.
// A prerelease sorts before its corresponding release (1.0.0-rc.1 < 1.0.0).
export function compareVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) {
    throw new Error(`Cannot compare versions "${a}" and "${b}"`)
  }

  for (const key of ['major', 'minor', 'patch']) {
    if (va[key] !== vb[key]) return va[key] < vb[key] ? -1 : 1
  }

  if (!va.prerelease.length && vb.prerelease.length) return 1
  if (va.prerelease.length && !vb.prerelease.length) return -1

  const len = Math.max(va.prerelease.length, vb.prerelease.length)
  for (let i = 0; i < len; i++) {
    const ia = va.prerelease[i]
    const ib = vb.prerelease[i]
    // Shorter prerelease sorts first (1.0.0-rc < 1.0.0-rc.1)
    if (ia === undefined) return -1
    if (ib === undefined) return 1
    const numericA = /^\d+$/.test(ia)
    const numericB = /^\d+$/.test(ib)
    if (numericA && numericB) {
      if (Number(ia) !== Number(ib)) return Number(ia) < Number(ib) ? -1 : 1
    } else if (numericA !== numericB) {
      // Numeric identifiers sort before alphanumeric ones
      return numericA ? -1 : 1
    } else if (ia !== ib) {
      return ia < ib ? -1 : 1
    }
  }
  return 0
}
