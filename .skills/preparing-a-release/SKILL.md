---
name: preparing-a-release
id: 188580c9-304e-4bbf-8bf5-764535982d40
author: Levi Putna
repo: https://github.com/levi-putna/dot-skills
description: >-
  Run a full pre-release check before cutting a new version: invokes
  reviewing-code and checking-release-readiness, determines the right
  semver bump from the size and nature of changes since the last
  published version, updates CHANGELOG.md, verifies the git repo is
  committed and pushed, and hands back the exact npm publish command. Use
  when asked to cut a release, prepare a release, bump the version, or
  "get this ready to publish."
dependencies:
  - type: cli
    name: npm
    required: true
    description: >-
      Used to check the currently published version (`npm view <pkg>
      version`) and to hand back the publish command.
    instructions: Install Node.js (bundles npm) from https://nodejs.org.
  - type: cli
    name: gh
    required: false
    description: >-
      Used to double-check the GitHub remote's state. Falls back to plain
      `git` commands if unavailable.
    instructions: Install via `brew install gh` or see https://cli.github.com.
---

# Preparing a release

Orchestrates the two check skills, decides the version bump, updates the
changelog, verifies nothing is stranded locally, and stops short of the
one step that actually needs a human: `npm publish`.

## 1. Run the two check skills first

Run `reviewing-code` against everything changed since the last published
version (not just uncommitted changes; diff against the last release
tag, or against the version currently on npm if there's no tag). Run
`checking-release-readiness` the same way.

**Do not proceed past this point if either skill has findings the user
hasn't dispositioned yet.** A release prepared over unresolved findings is
worse than a slower release. Surface them and wait.

## 2. Establish what's actually changed

- Read the version in `package.json`.
- Run `npm view <package-name> version` to get what's actually published.
- If they already match, nothing has shipped since the last bump. Say so
  and ask whether the user wants to proceed anyway (there may be
  unpublished-but-committed changes worth releasing) rather than assuming.
- Otherwise, diff `git log <last-release-tag-or-commit>..HEAD` to see
  everything going into this release.

## 3. Classify the change and propose a version

Use semver, and favor the higher tier when a change is ambiguous:

- **MAJOR**: removed or renamed a command/flag, changed a file format,
  changed default/documented behavior in a way that breaks existing
  usage.
- **MINOR**: new, backward-compatible functionality: a new command, a
  new flag, a new skill added to `.skills/`.
- **PATCH**: bug fixes, documentation fixes, internal refactors with no
  user-visible behavior change.

State which tier you picked and why, propose the exact new version
number, and **ask the user to confirm before changing anything.** Don't
silently bump.

## 4. Update CHANGELOG.md

Once confirmed, add a new dated entry at the top (below the header),
following the file's existing [Keep a Changelog](https://keepachangelog.com/)
style, categorized under `Added` / `Changed` / `Fixed` / `Removed` as
appropriate. Summarize from the actual diff and commit messages, not
generic boilerplate ("various improvements" is not an entry).

## 5. Bump the version

Update `version` in `package.json`, then run
`npm install --package-lock-only` so `package-lock.json`'s recorded
version stays in sync (npm treats a mismatch there as an error on
publish).

## 6. Verify the repo is actually shippable

- `git status` must be clean: no uncommitted changes. If there are any
  (including the changelog/version bump you just made), tell the user
  what needs committing; don't commit on their behalf without asking.
- The current branch must be pushed with nothing left ahead of or behind
  its remote (`git status -sb`, or `git rev-list --left-right --count
  origin/<branch>...<branch>`). If anything is unpushed, say so and ask
  before pushing.

## 7. Hand back the publish command, don't run it

Once everything above is clean, give the user the exact command:

```sh
npm publish --otp=<code-from-your-authenticator>
```

**Never run `npm publish` yourself, with or without an `--otp` value, and
never guess or fabricate an OTP.** Publishing is a real, irreversible,
public action gated on a time-sensitive code only the user has. Your job
ends at handing back the correct command with everything it depends on
already verified.

## 8. Summarize

Old version → new version, the changelog entry you added, confirmation
that git is clean and pushed, and the publish command from step 7.
