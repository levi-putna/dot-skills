# dot-skills

One `.skills/` folder as the source of truth for agent skills, linked out to
every coding agent that reads them.

```sh
npx dot-skills init
```

## The idea

[Anthropic's `SKILL.md` format](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
is now an open standard read natively by Claude Code, Cursor, GitHub
Copilot, Windsurf, OpenAI Codex CLI, and Gemini CLI. The problem isn't
format conversion anymore. It's that each agent looks for skills in a
different folder:

| Agent | Project skills dir | Global (personal) skills dir |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Cursor | `.cursor/skills/` | `~/.cursor/skills/` |
| GitHub Copilot | `.github/skills/` | `~/.copilot/skills/` |
| Windsurf (Cascade) | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| OpenAI Codex CLI | `.codex/skills/` | `~/.codex/skills/` |
| Gemini CLI | `.gemini/skills/` | `~/.gemini/skills/` |

`dot-skills` keeps exactly one real copy of each skill in `.skills/` at your
project root, and symlinks it into whichever of the folders above you
actually use. Edit the skill once, in one place; every agent sees the
update immediately. On filesystems without symlink support (e.g. Windows
without developer mode), it falls back to copying and re-copies on
`dot-skills link`.

A `.skills/` folder is also how `dot-skills` recognizes a *source* of
skills: any public GitHub repo with a `.skills/<name>/SKILL.md` in it can
be pulled from with `dot-skills add owner/repo`, including this repo
itself. Local edits can be sent back upstream as a pull request with
`dot-skills push` (see [Pushing changes upstream](#pushing-changes-upstream)).

## Quick start

```sh
# In a project: creates .skills/, links into whichever agents you pick
npx dot-skills init

# Install a skill from any repo with a .skills/ folder
npx dot-skills add levi-putna/dot-skills/dotskills-create-skill

# See what's available in a repo before installing
npx dot-skills list owner/repo

# See what's installed here, which agents it's linked to, and dependency status
npx dot-skills installed

# Check declared dependencies (env vars / CLI tools) for everything installed
npx dot-skills doctor

# After editing an installed skill locally, open a PR on its source repo
# (needs GITHUB_TOKEN or GH_TOKEN — see Pushing changes upstream)
npx dot-skills push dotskills-create-skill
```

The first time `dot-skills` runs on a machine (any command, not just
`init`), it also installs two starter skills into `~/.dot-skills/skills/`
and links them into whichever agents it finds already configured on your
machine. See [Starter skills](#starter-skills-installed-on-first-run)
below.

## Commands

| Command | Does |
|---|---|
| `dot-skills init` | Create `.skills/` in the current project (if missing), install the two starter skills, link into chosen agents |
| `dot-skills add <owner/repo>[/skill][#ref]` | Install one or more skills from a repo's `.skills/` folder (and any skills they `require`) |
| `dot-skills list [owner/repo]` | List skills + descriptions in a repo, or (no args) in the local `.skills/` |
| `dot-skills installed` | Show installed skills: source, version, linked agents, dependency status |
| `dot-skills update [skill\|owner/repo/skill]` | Check installed skills against their source repos and pull down newer versions (see [Updating skills](#updating-skills)) |
| `dot-skills push <skill\|owner/repo/skill>` | Open a pull request on the skill's source repo with your local edits (see [Pushing changes upstream](#pushing-changes-upstream)) |
| `dot-skills link [skill...]` | (Re)create symlinks for skills already in `.skills/`, e.g. after adding a new agent to the project |
| `dot-skills remove <skill>` | Delete a skill from `.skills/` and unlink it from every agent it was linked into |
| `dot-skills doctor [--links] [--fix]` | Check every installed skill's declared dependencies against the current environment (and, with `--links`, symlink health — see [Checking symlinks](#checking-symlinks)) |
| `dot-skills version <skill> <major\|minor\|patch\|x.y.z>` | Bump or set a skill's `version` frontmatter |
| `dot-skills require <skill> <dep>` | Add a skill-to-skill dependency (`local-name` or `owner/repo/skill[#ref]`) |

Every command except `init` accepts `--global` to operate on
`~/.dot-skills/skills/` and each agent's global directory instead of the
current project.

Non-interactive flags for scripts/CI: `--agents=claude,cursor`, `--all`,
and (for `add`) `--skills=a,b`. Without a TTY, agent pickers fall back to
detected agents (not `--all`), and `add` requires an explicit skill path
or `--skills` rather than prompting. For `push`, set `GITHUB_TOKEN` or
`GH_TOKEN`, and optionally pass `--title`, `--body`, `--force`, or
`--interactive=false` (see [Pushing changes upstream](#pushing-changes-upstream)).

`list` and `installed` word-wrap descriptions to the terminal width
(capped at a readable ~88 columns); all commands color-highlight names and
status. Color is automatically disabled when output isn't a terminal
(piped to a file or another command) or when `NO_COLOR` is set.

`dot-skills list <owner/repo>` also marks entries you already have
installed (project-local or global) with `(already installed)`, matched by
`id` where available and falling back to name.

## Updating skills

```sh
# Check every installed skill against the repo it was installed from
npx dot-skills update

# Update just one skill (by name, or the same owner/repo/skill form used with add)
npx dot-skills update development-review-code
npx dot-skills update acme/skills/development-review-code
```

`update` re-fetches each skill from the `owner/repo` (and branch) recorded
in the lockfile at install time and compares contents. Skills whose files
match upstream are reported as up to date; anything that changed upstream
gets pulled down, re-linked into the same agents, and re-recorded in the
lockfile.

If you've edited a skill locally since installing it, `update` won't
silently destroy your changes: it prompts per-skill before overwriting
(the default answer is *No*). Two flags control this:

- `--force`: overwrite everything with no prompts (default: `false`)
- `--interactive=false` (or `--no-interactive`): never prompt. Skills
  with local changes are skipped instead. This is also the automatic
  behaviour when stdin isn't a TTY, for example in CI

Skills that can't be checked are never touched; they're listed at the end
as *skipped* with the reason: created locally (no source repo to check),
bundled with dot-skills itself, the source repo no longer exists or is now
private, or the skill folder was removed upstream.

Version numbers come from the optional `version` frontmatter field (see
below). When both your copy and the upstream copy declare one, `update`
shows the change (`1.0.0 -> 1.1.0`) and skips downgrades (upstream version
older than yours). Skills without a `version` are still updatable. Change
detection is content-based, so versions are informative rather than required.

## Pushing changes upstream

Skills live as ordinary files under `.skills/` in whatever project you
installed them into — that project's own git history is unrelated. When you
edit a skill locally and want those edits back on the repo you installed
from, open a pull request with:

```sh
# Requires GITHUB_TOKEN or GH_TOKEN (Contents + Pull requests write, or
# permission to fork). If you use the GitHub CLI:
#   export GITHUB_TOKEN=$(gh auth token)
npx dot-skills push development-review-code
npx dot-skills push acme/skills/development-review-code

# Optional: override the PR title/body, or skip prompts
npx dot-skills push development-review-code \
  --title="Clarify review checklist" \
  --body="Tightens the security section based on project use."
npx dot-skills push development-review-code --force
```

`push` compares your local copy to the `owner/repo` (and branch) recorded
in the lockfile, shows the file-level diff, and — after you confirm —
creates a branch and pull request via the GitHub API. On success it prints
the PR URL; in an interactive terminal you can press **space** to open it
in your browser, or **enter** to skip. It does **not** need `git` or the
`gh` CLI installed, and it never commits into the consuming project.

If your token can't write to the source repo, `push` forks it (or reuses
an existing fork), pushes the branch there, and opens the PR upstream.

Useful flags:

- `--global`: push a skill from `~/.dot-skills/skills/` instead of the
  current project
- `--title=...` / `--body=...`: override the PR title and body
- `--force`: skip confirmation and the space-to-open prompt
- `--interactive=false`: never prompt (also the behaviour when stdin isn't
  a TTY); the PR is opened without asking, and the space-to-open offer is
  skipped

Skills created locally (`source: local`), bundled starter skills, or
skills whose lockfile entry isn't a usable `owner/repo` can't be pushed —
there's nowhere to open the PR. If local and upstream already match,
`push` exits with nothing to do.

## Checking symlinks

```sh
# Audit every skill in .skills/ against every agent — reports missing,
# broken, mis-pointed, and orphaned links without changing anything
npx dot-skills doctor --links

# Same audit, but repair everything it finds
npx dot-skills doctor --links --fix
```

`doctor --links` scans `.skills/` directly off disk (not just the
lockfile), so skills you've added by hand are covered too, not only ones
installed via `add`/`link`. For every skill and every agent detected in
this project (or, with `--global`, every agent detected on the machine —
plus any agent a skill's lockfile entry already claims it's linked into),
it reports one of:

- **missing** — no link exists yet
- **broken** — a symlink whose target no longer exists
- **wrong-target** — a symlink pointing somewhere other than the canonical `.skills/<name>`
- **stale-copy** — a fallback copy (filesystems without symlink support) whose contents no longer match the canonical copy
- **unexpected** — something other than a symlink or recognised fallback copy is in the way
- **orphan** — a leftover entry in an agent's skills dir with no matching folder left in `.skills/`

Without `--fix` it's read-only and exits non-zero if it finds anything.
With `--fix`, every issue above gets repaired in place (re-linked, or in
the orphan's case, removed), and each affected skill's lockfile entry is
brought in line with what's actually on disk afterwards — including
creating one for hand-added skills that never had a lockfile entry at all.
Rerun `dot-skills doctor --links` afterwards to confirm it's clean.

## Skill format

A skill is a folder under `.skills/`:

```
.skills/
  my-skill/
    SKILL.md      # required: frontmatter + instructions
    README.md      # optional: human-facing docs
    references/    # optional: long-form docs loaded only when needed
    scripts/       # optional: helper scripts
    assets/        # optional: templates/files used in output
```

`SKILL.md` frontmatter:

```yaml
---
name: my-skill
id: 56824965-a4de-4b74-bf8d-5d04b598de77
version: 1.0.0
author: Your Name
repo: https://github.com/your-name/your-skills-repo
description: >-
  What it does, and when an agent should reach for it. This is the only
  thing most agents see before deciding whether to load the skill, so be
  concrete about trigger phrases.
dependencies:
  - type: env
    name: OPENAI_API_KEY
    required: true
    description: Needed to call the OpenAI API.
    instructions: >-
      Create a key at https://platform.openai.com/api-keys, then
      export OPENAI_API_KEY=sk-... in your shell profile.
  - type: cli
    name: jq
    required: false
    instructions: Install via `brew install jq`.
---

Markdown instructions for the agent go here.
```

`id` is a UUID, generated once when the skill is first created (e.g. with
`node -e "console.log(crypto.randomUUID())"`) and never changed afterward.
It's the skill's stable identity, independent of its name or which repo
a copy ends up in. `dot-skills list <owner/repo>` uses it to mark entries
you already have installed, and to recognize the two starter skills
regardless of what a particular copy got renamed to (see below). It's
optional but recommended; skills without one just don't get either
benefit.

`version` is an optional semver string, bumped by the skill's author when
its contents change meaningfully. `dot-skills update` uses it to report
what changed (`1.0.0 -> 1.1.0`) and to avoid replacing a newer local copy
with an older upstream one; `installed` shows it next to the skill name.

`author` and `repo` are both optional plain-text attribution: who wrote
the skill, and a link back to where its canonical, maintained source
lives. Both are shown by `list`/`installed` when present, and travel with
the file itself. Unlike the per-install provenance already tracked in
the lockfile (which repo *you* installed a copy from), these stay attached
even if the raw `SKILL.md` gets copied around by hand.

`dependencies` is optional. Each entry is `type: env` (an environment
variable) or `type: cli` (a command that must be on `PATH`), with
`required` (default `true`), a human-readable `description`, and
`instructions` for how to satisfy it. `dot-skills add` and `dot-skills update`
print these as a setup notice right after installing or updating. `dot-skills
doctor` re-checks `env` dependencies against the current shell and fails when
required ones are missing; `cli` dependencies can't be auto-verified (they
show as `[unknown]` on `installed`, and `doctor` doesn't fail on them).

## Skill-to-skill dependencies (`requires`)

A skill can declare that it needs other skills installed alongside it,
using a separate `requires` frontmatter field (kept distinct from the
env/cli `dependencies` above):

```yaml
requires:
  - id: 56824965-a4de-4b74-bf8d-5d04b598de77
    source: owner/other-repo      # optional #branch
    name: helper-skill            # optional hint; id is authoritative
  - id: 8e2c1b0a-1111-2222-3333-444444444444
    source: self                  # sibling skill in the same repo
    name: another-helper
  - id: 2f9a7d3e-aaaa-bbbb-cccc-dddddddddddd
    name: yet-another-helper      # source omitted — same as source: self
```

Each entry needs the target skill's stable `id`. `source` is either an
`owner/repo[#ref]` (same shorthand as `dot-skills add`) or the literal
`self`, meaning "resolve within whichever repo/ref this skill itself came
from." Omitting `source` entirely also means `self` — the common case of
two skills published side by side in the same `.skills/` folder.

There is no version constraint on `requires`. Dependencies always resolve
to whatever is at the declared source/ref right now, matching how `add`
and `update` already work. Conflicting sources for the same `id`, name
collisions with an unrelated local skill, and circular dependencies are
hard errors.

Prefer the CLI over hand-editing frontmatter:

```sh
# Same-repo / local sibling (writes source: self by omitting it)
npx dot-skills require my-skill helper-skill

# Cross-repo
npx dot-skills require my-skill owner/other-repo/helper-skill

# Bump version after a meaningful change
npx dot-skills version my-skill minor
```

`dot-skills require` verifies the dependency actually exists (reads the
local sibling, or fetches the remote `SKILL.md`) and refuses to write an
entry when the target has no `id`. `add` resolves the full dependency
tree before installing, shows everything that will be pulled in, and
confirms once. `update` installs any newly declared requires that are
still missing. `remove` warns when other installed skills still depend on
the skill being removed (override with `--force`). `installed` and
`doctor` both surface `requires` status (`ok` / `MISSING`) live from
each skill's frontmatter — nothing is cached in the lockfile.

## Starter skills (installed on first run)

Two meta-skills ship with `dot-skills` itself and get installed
automatically: into `.skills/` on `init`, and globally to
`~/.dot-skills/skills/` the very first time `dot-skills` runs on a machine:

- **`dotskills-create-skill`**: how to author a new skill: the
  `<domain>-<action>-<topic>` naming convention, the frontmatter schema
  above, writing a description that actually triggers, and linking it out
  once it's written. Point an agent at this whenever someone asks it to
  "make this a skill" or "add a skill for X."
- **`dotskills-import-skill`**: how to migrate something that already exists in
  agent-native form (a legacy `.cursorrules` or `.cursor/rules/*.mdc`, a
  `.clinerules`, `.windsurfrules`, `.github/copilot-instructions.md`, a
  section of `AGENTS.md`/`CLAUDE.md`, or a `SKILL.md` sitting untracked in
  one agent's own skills folder) into a canonical `.skills/<name>/`. Point
  an agent at this whenever someone asks it to import, migrate, or convert
  existing rules into `dot-skills` format.

Both are themselves ordinary skills. Read them at
[`.skills/dotskills-create-skill/SKILL.md`](.skills/dotskills-create-skill/SKILL.md) and
[`.skills/dotskills-import-skill/SKILL.md`](.skills/dotskills-import-skill/SKILL.md).

Because `init` copies these two into every consuming project's own
`.skills/`, practically any dot-skills-enabled repo ends up carrying a copy,
so `dot-skills list <owner/repo>` deliberately never shows them, no
matter whose repo you point it at (matched by their fixed `id`, so a
renamed copy is still recognized). They're still installable by name if
you ever need to recover one: `dot-skills add <owner/repo>/dotskills-create-skill`.

## Also available from this repo

Beyond the two starter skills, this repo's `.skills/` folder ships three
more you can install the same way any other repo's skills install; they're
opt-in, not auto-installed by `init`:

```sh
npx dot-skills add levi-putna/dot-skills/development-review-code
npx dot-skills add levi-putna/dot-skills/development-check-release-readiness
npx dot-skills add levi-putna/dot-skills/development-prepare-release
```

- **`development-review-code`**: reviews a diff, PR, or set of files for
  correctness and security bugs. Reports findings and asks how you want
  each one handled; never edits code unilaterally.
- **`development-check-release-readiness`**: audits code and documentation for
  drift: claims in the README that no longer match what the code does,
  broken internal links, undocumented flags.
- **`development-prepare-release`**: runs the two skills above, proposes a
  semver bump based on what actually changed, updates
  [`CHANGELOG.md`](CHANGELOG.md), verifies git is committed and pushed,
  and hands back the exact `npm publish` command (it never runs
  `npm publish` itself, since that always needs a human-provided,
  time-sensitive OTP).

## Publishing your own skills

Any public GitHub repo with `.skills/<name>/SKILL.md` folders at its root
works as an installable source; there's no registry to publish to or
register with:

```sh
npx dot-skills add your-name/your-skills-repo
npx dot-skills list your-name/your-skills-repo
```

## License

MIT
