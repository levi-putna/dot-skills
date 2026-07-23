# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-07-23

### Added

- `dot-skills push <skill>`: open a pull request on a skill's source repo
  with your local edits. Uses the GitHub API (`GITHUB_TOKEN` / `GH_TOKEN`) —
  no `git` or `gh` CLI required, and the consuming project's own git history
  is untouched. Forks automatically when the token can't write to the source
  repo. Prints the PR URL and, in an interactive terminal, offers **space**
  to open it in the browser (enter to skip). Supports `--title`, `--body`,
  `--force`, and `--interactive=false`.

## [0.3.1] - 2026-07-22

### Fixed

- `update` rejected add-style `owner/repo/skill` arguments even when the
  skill was installed — it only accepted the bare skill name from the
  lockfile. It now resolves either form.
- `doctor`'s missing-`requires` hint built an invalid `dot-skills add` spec
  when the dependency's `source` included `#ref` (e.g. suggested
  `acme/skills#v2/helper` instead of `acme/skills/helper#v2`).
- README claimed every command accepts `--global` (false for `init`), that
  `init`/`link` print dependency setup notices (only `add`/`update` do),
  that `doctor` reports CLI deps (it doesn't — `installed` shows them as
  `[unknown]`), that non-interactive flags are "used automatically" without
  a TTY (agents fall back to detected; `add` still needs an explicit skill),
  and omitted the `unexpected` symlink status from the `--links` audit list.

### Changed

- Long dependency instructions and requires-install notes now word-wrap to
  the terminal width (including inside clack note boxes) instead of blowing
  past the margin.

## [0.3.0] - 2026-07-22

### Added

- Skill-to-skill dependencies via a `requires` frontmatter field: `dot-skills
  require <skill> <dep>` declares one (verified against the local sibling or
  a remote repo before writing). `add` resolves and installs the full
  dependency tree with a single confirmation; `update` backfills any newly
  declared `requires` still missing locally; `remove` warns — and confirms,
  or refuses without `--force` — when other installed skills still depend on
  the skill being removed; `installed` and `doctor` surface live `requires`
  status (`ok` / `MISSING`), nothing cached in the lockfile.
- `dot-skills version <skill> <major|minor|patch|x.y.z>`: bump or set a
  skill's `version` frontmatter.
- `dot-skills doctor --links [--fix]`: audits every skill in `.skills/`
  (scanned off disk, so skills added by hand are covered too, not just ones
  the lockfile tracks) against every detected agent for missing, broken,
  mis-pointed, or orphaned symlinks. `--fix` repairs everything found and
  brings each affected skill's lockfile entry in line with what's actually
  linked, including registering hand-added skills that never had one.
- `remove` now accepts `--force` and `--interactive=false`, matching `update`.

### Fixed

- `update` could silently fail to link a newly-installed skill into any
  agent when it was a second-or-deeper dependency in a `requires` chain:
  because dependencies install leaf-first, the leaf's own requiring skill
  hadn't been recorded in the lockfile yet at the point agents were
  resolved for it, so it landed in `.skills/` but was never linked anywhere.
  Agent resolution now walks the `requires` chain instead of assuming the
  immediate parent is already recorded.
- CLI help text listed `--interactive=false` as `update`-only; `remove`
  honors it too.
- README incorrectly claimed `doctor` word-wraps descriptions like `list`
  and `installed` do; `doctor` doesn't print descriptions at all.

### Changed

- Renamed the bundled starter skills and this repo's own example skills to
  a consistent `<domain>-<action>-<topic>` naming convention:
  `creating-skills` → `dotskills-create-skill`, `importing-skills` →
  `dotskills-import-skill`, `reviewing-code` → `development-review-code`,
  `checking-release-readiness` → `development-check-release-readiness`,
  `preparing-a-release` → `development-prepare-release`.

## [0.2.0] - 2026-07-22

### Added

- `dot-skills update [skill]` command: checks installed skills against the
  source repo recorded in the lockfile and pulls down newer versions.
  Skills with local edits prompt before being overwritten. Use `--force`
  to overwrite everything, or `--interactive=false` to skip conflicted skills
  instead of prompting. Skills that can't be checked (created locally,
  bundled, source repo gone or private, or removed upstream) are
  reported as skipped with the reason.
- Optional `version` frontmatter field (semver) on skills, shown by
  `installed` and used by `update` to report version changes and skip
  downgrades.
- The lockfile now records each skill's `version` and a `contentHash`
  fingerprint at install time, so `update` can tell local edits apart
  from upstream changes.

## [0.1.1] - 2026-07-21

### Fixed

- `list --global` silently ignored the flag and always listed the local
  project's `.skills/`; it now resolves project vs. global scope like
  every other command.
- The first-run global bootstrap was skipped specifically when the
  invoked command was `init`, the opposite of the documented behavior
  ("any command, not just `init`"). It now always runs before dispatch.

## [0.1.0] - 2026-07-21

### Added

- Initial release: `init`, `add`, `list`, `installed`, `link`, `remove`,
  and `doctor` commands.
- Canonical `.skills/<name>/SKILL.md` store, symlinked (falling back to a
  copy where symlinks aren't supported) into Claude Code, Cursor, GitHub
  Copilot, Windsurf, OpenAI Codex CLI, and Gemini CLI's own skill
  directories, both at the project and global (`--global`) level.
- `dependencies:` frontmatter field (`env` / `cli`) with post-install
  setup notices and `dot-skills doctor` checks against the current
  environment.
- Two starter meta-skills, `creating-skills` and `importing-skills`,
  installed automatically on `init` and on the first-ever `dot-skills`
  invocation on a machine.
