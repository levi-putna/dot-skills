// Minimal argv parser: splits positionals from --flag / --flag=value / --flag value pairs.
// Flags listed in `booleans` never consume the next argument, so
// `update --force my-skill` keeps "my-skill" as a positional.
export function parseArgs(argv, { booleans = [] } = {}) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      } else if (!booleans.includes(arg.slice(2)) && argv[i + 1] && !argv[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = argv[++i]
      } else {
        flags[arg.slice(2)] = true
      }
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}
