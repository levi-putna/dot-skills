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
itself.

## Quick start

```sh
# In a project: creates .skills/, links into whichever agents you pick
npx dot-skills init

# Install a skill from any repo with a .skills/ folder
npx dot-skills add levi-putna/dot-skills/creating-skills

# See what's available in a repo before installing
npx dot-skills list owner/repo

# See what's installed here, which agents it's linked to, and dependency status
npx dot-skills installed

# Check declared dependencies (env vars / CLI tools) for everything installed
npx dot-skills doctor
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
| `dot-skills add <owner/repo>[/skill][#ref]` | Install one or more skills from a repo's `.skills/` folder |
| `dot-skills list [owner/repo]` | List skills + descriptions in a repo, or (no args) in the local `.skills/` |
| `dot-skills installed` | Show installed skills: source, linked agents, dependency status |
| `dot-skills link [skill...]` | (Re)create symlinks for skills already in `.skills/`, e.g. after adding a new agent to the project |
| `dot-skills remove <skill>` | Delete a skill from `.skills/` and unlink it from every agent it was linked into |
| `dot-skills doctor` | Check every installed skill's declared dependencies against the current environment |

Every command accepts `--global` to operate on `~/.dot-skills/skills/` and
each agent's global directory instead of the current project.

Non-interactive flags (for scripts/CI, and used automatically when stdin
isn't a TTY): `--agents=claude,cursor`, `--all`, and (for `add`)
`--skills=a,b`.

`list`, `installed`, and `doctor` word-wrap descriptions to the terminal
width (capped at a readable ~88 columns) and color-highlight names and
status. Color is automatically disabled when output isn't a terminal
(piped to a file or another command) or when `NO_COLOR` is set.

`dot-skills list <owner/repo>` also marks entries you already have
installed (project-local or global) with `(already installed)`, matched by
`id` where available and falling back to name.

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

`author` and `repo` are both optional plain-text attribution: who wrote
the skill, and a link back to where its canonical, maintained source
lives. Both are shown by `list`/`installed` when present, and travel with
the file itself. Unlike the per-install provenance already tracked in
the lockfile (which repo *you* installed a copy from), these stay attached
even if the raw `SKILL.md` gets copied around by hand.

`dependencies` is optional. Each entry is `type: env` (an environment
variable) or `type: cli` (a command that must be on `PATH`), with
`required` (default `true`), a human-readable `description`, and
`instructions` for how to satisfy it. `dot-skills add`/`init`/`link` print
these as a setup notice right after installing, and `dot-skills doctor`
re-checks `env` dependencies against the current shell at any time (`cli`
dependencies are reported but can't be auto-verified).

## Starter skills (installed on first run)

Two meta-skills ship with `dot-skills` itself and get installed
automatically: into `.skills/` on `init`, and globally to
`~/.dot-skills/skills/` the very first time `dot-skills` runs on a machine:

- **`creating-skills`**: how to author a new skill: naming, the
  frontmatter schema above, writing a description that actually triggers,
  and linking it out once it's written. Point an agent at this whenever
  someone asks it to "make this a skill" or "add a skill for X."
- **`importing-skills`**: how to migrate something that already exists in
  agent-native form (a legacy `.cursorrules` or `.cursor/rules/*.mdc`, a
  `.clinerules`, `.windsurfrules`, `.github/copilot-instructions.md`, a
  section of `AGENTS.md`/`CLAUDE.md`, or a `SKILL.md` sitting untracked in
  one agent's own skills folder) into a canonical `.skills/<name>/`. Point
  an agent at this whenever someone asks it to import, migrate, or convert
  existing rules into `dot-skills` format.

Both are themselves ordinary skills. Read them at
[`.skills/creating-skills/SKILL.md`](.skills/creating-skills/SKILL.md) and
[`.skills/importing-skills/SKILL.md`](.skills/importing-skills/SKILL.md).

Because `init` copies these two into every consuming project's own
`.skills/`, practically any dot-skills-enabled repo ends up carrying a copy,
so `dot-skills list <owner/repo>` deliberately never shows them, no
matter whose repo you point it at (matched by their fixed `id`, so a
renamed copy is still recognized). They're still installable by name if
you ever need to recover one: `dot-skills add <owner/repo>/creating-skills`.

## Also available from this repo

Beyond the two starter skills, this repo's `.skills/` folder ships three
more you can install the same way any other repo's skills install; they're
opt-in, not auto-installed by `init`:

```sh
npx dot-skills add levi-putna/dot-skills/reviewing-code
npx dot-skills add levi-putna/dot-skills/checking-release-readiness
npx dot-skills add levi-putna/dot-skills/preparing-a-release
```

- **`reviewing-code`**: reviews a diff, PR, or set of files for
  correctness and security bugs. Reports findings and asks how you want
  each one handled; never edits code unilaterally.
- **`checking-release-readiness`**: audits code and documentation for
  drift: claims in the README that no longer match what the code does,
  broken internal links, undocumented flags.
- **`preparing-a-release`**: runs the two skills above, proposes a
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
