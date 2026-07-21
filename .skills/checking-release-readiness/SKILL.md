---
name: checking-release-readiness
id: 7c6ec2da-59e5-4832-abf4-a8c477b47f84
author: Levi Putna
repo: https://github.com/levi-putna/dot-skills
description: >-
  Audit whether code and documentation are consistent, current, and ready
  to ship. Cross-checks every claim in the README/docs against the actual
  CLI or API behavior, flags stale examples, undocumented flags, and
  broken internal links. Use when asked to check if something is "ready
  to release," review documentation for accuracy, or audit whether docs
  match the code.
---

# Checking release readiness

Documentation goes stale silently: code changes, nobody remembers to
update the paragraph that described the old behavior, and it ships wrong.
This skill is a line-by-line audit of documentation against the real
implementation, not a prose read-through.

## 1. Inventory every checkable claim

Go through the README, and any other user-facing docs (SKILL.md files
that describe CLI/tool behavior, `--help` text, code comments that
promise behavior), and list every claim that could be verified against
code:

- Every command and flag mentioned, and what it's claimed to do
- Every "always"/"every"/"automatically" statement: these are the ones
  most likely to have a silent exception
- Every file path, directory structure, or example command shown
- Every internal link (relative markdown links, code references)

## 2. Verify each claim against the actual code path

For each claim, find the corresponding source and trace it. Don't just
re-read the prose and nod because it sounds plausible. Concretely:

- If docs say "every command accepts `--global`," check the argument
  parsing and dispatch for every single command, not just a couple.
- If docs say something "runs automatically" under a condition, find the
  `if` that guards it and check the condition actually matches what's
  described.
- If docs show an example command, mentally (or actually) run it and
  check the output matches what's shown.
- If docs link to another file (`[foo](path/to/foo.md)`), confirm that
  path exists relative to the linking file.

This is exactly the kind of check that's easy to skip because prose reads
fine on its own. The defect only shows up by checking prose against code,
not by re-reading the prose harder.

## 3. Check for drift in both directions

- **Code ahead of docs**: a flag, command, or behavior exists in code but
  isn't mentioned anywhere in the docs.
- **Docs ahead of code**: docs describe something that was removed,
  renamed, or never actually implemented that way.

## 4. Check consistency and polish

- Formatting: misaligned ASCII diagrams/tables, inconsistent terminology
  for the same concept (don't call the same thing two different names
  across the README).
- Leftover TODOs, placeholder text, or copy-pasted boilerplate that wasn't
  adapted to this project.

## 5. Report the same way as `reviewing-code`

Most-severe first, one finding per contradiction: quote what the docs
claim, cite the file/line of the code that actually decides it, and state
concretely how they diverge. Don't silently edit docs or code. Recommend
the fix and ask, unless this skill was invoked from `preparing-a-release`,
which owns the confirm/apply loop for the whole release.

## Don't

- Don't treat "the prose is well-written" as evidence it's correct.
  Well-written and accurate are independent properties.
- Don't skip a claim because it seems obviously true; the ones that seem
  most obvious are the ones nobody re-checks after a refactor.
- Don't report purely subjective writing-quality feedback here. That's a
  different job. This skill is about factual accuracy, not prose style.
