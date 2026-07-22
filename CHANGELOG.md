# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/).

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
