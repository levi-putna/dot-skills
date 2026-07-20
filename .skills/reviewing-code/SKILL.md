---
name: reviewing-code
description: >-
  Review code changes (uncommitted work, a branch diff, a PR, or named
  files) for correctness bugs, security issues, and reliability problems.
  Reports findings back to the user one at a time, asks how they want each
  one handled, and recommends a concrete fix — never edits code
  unilaterally. Use when asked to review code, review a PR or diff, check
  recent changes for bugs, or "look over" what was just written.
---

# Reviewing code

A code review that reports findings and asks before touching anything.
This is not a linter and not an auto-fixer — its job is to surface real
defects, explain exactly how they fail, and let the user decide what
happens next.

## 1. Determine scope

If the user named a scope (a PR, a branch, specific files), use it. If not:

- Uncommitted changes exist → review `git diff` (and `git diff --staged`)
  against the working tree.
- No uncommitted changes → review the commits on the current branch that
  aren't on the default branch (`git log <default-branch>..HEAD` and the
  corresponding diff).
- Neither applies → ask what to review rather than guessing.

Read full files around the changed lines, not just the patch context —
a diff hunk without the surrounding function/class is not enough to judge
correctness.

## 2. Review dimensions, in priority order

1. **Correctness** — logic errors, off-by-one, incorrect conditionals,
   race conditions, wrong error handling, state mutated in the wrong
   place.
2. **Security** — injection (SQL, command, template), unsafe
   deserialization, secrets or credentials committed in plaintext, missing
   authorization checks, unsanitized input reaching a sink.
3. **Reliability** — unhandled edge cases (empty input, null/undefined,
   network failure, concurrent access), resource leaks.
4. **Reuse and simplification** — only flag when it's clearly reducing
   real complexity, not as a style preference.

Don't flag pure style (naming, formatting, comment density) unless it
actively causes one of the above.

## 3. Verify before reporting

For every candidate finding, construct the concrete failure scenario
before writing it down: specific input or state → specific wrong output
or crash. If you can't concretize it, it's not a finding — discard it or
downgrade it to a question for the user rather than an asserted bug.
Findings that are merely "this looks unusual" are noise; don't report
them as if they were bugs.

## 4. Report, most severe first

For each verified finding, state:

- File and line
- One-sentence summary of the defect
- The concrete failure scenario from step 3

Do this for every finding before touching any code. If nothing survives
verification, say so plainly — "no issues found" is a valid, useful
outcome. Don't invent minor nits to appear thorough.

## 5. Ask before acting

For each finding, ask the user how they want to handle it (fix now,
defer, or dismiss as not-a-bug) and recommend the smallest correct fix —
not a refactor, not a rewrite of the surrounding function. Only make an
edit once the user has told you to, whether one at a time or "fix
everything you found." If you do apply a fix, re-verify the specific
scenario from step 3 against the new code before moving on.

## Notes

- This skill is agent-agnostic: it doesn't depend on any single coding
  agent's built-in review tooling, so the same procedure applies whether
  you're running in Claude Code, Cursor, Copilot, Windsurf, Codex CLI, or
  Gemini CLI.
- Reviewing and fixing are separate steps on purpose — the value of a
  review is lost if defects and their fixes are silently intermixed with
  unrelated changes.
