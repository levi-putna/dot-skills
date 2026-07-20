---
name: importing-skills
description: >-
  Guide for migrating an existing agent-native rule, instruction file, or
  skill into the canonical .skills/ format used by dot-skills. Use when the
  user asks to import, migrate, convert, or "bring in" an existing
  .cursorrules, .cursor/rules/*.mdc file, .clinerules, .windsurfrules,
  .github/copilot-instructions.md, AGENTS.md/CLAUDE.md section, or a skill
  that already lives natively in .claude/skills, .cursor/skills,
  .github/skills, .windsurf/skills, .codex/skills, or .gemini/skills without
  being tracked in .skills/.
---

# Importing existing skills into dot-skills

Many projects already have agent instructions scattered across
agent-specific files before adopting `dot-skills`. This skill converts any
of those into a canonical `.skills/<name>/SKILL.md`, so it becomes
reusable across every agent instead of locked to the one it was written
for.

## Where to look for existing content

Check for (and ask the user if unsure which applies):

| Source | Typical location | Format |
|---|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md` (not already a symlink into `.skills/`) | Already SKILL.md — mostly a move |
| Cursor (modern) | `.cursor/rules/*.mdc`, `.cursor/skills/<name>/SKILL.md` | `.mdc` has YAML frontmatter (`description`, `globs`, `alwaysApply`) + body |
| Cursor (legacy) | `.cursorrules` at repo root | Plain text/markdown, no frontmatter |
| GitHub Copilot | `.github/copilot-instructions.md`, `*.instructions.md`, `.github/skills/<name>/SKILL.md` | Markdown, sometimes with path-scoping frontmatter |
| Windsurf | `.windsurfrules`, `.windsurf/rules/`, `.windsurf/skills/<name>/SKILL.md` | Markdown |
| Cline | `.clinerules` | Plain markdown |
| Codex CLI / Gemini CLI | `.codex/skills/<name>/SKILL.md`, `.gemini/skills/<name>/SKILL.md` | Already SKILL.md |
| Cross-agent | `AGENTS.md`, `CLAUDE.md` | Markdown, may contain multiple unrelated instructions mixed together |

A single source file may contain several unrelated concerns — split it into
one skill per coherent capability rather than importing it verbatim as one
giant skill.

## Steps

1. **Read the source file(s) in full.** Don't skim — instructions that look
   like boilerplate often encode a real project convention.

2. **Identify the distinct capability (or capabilities).** For each one,
   decide a kebab-case name and draft a one-to-three-sentence description
   that states what it does and when it should trigger (see the
   `creating-skills` skill for what makes a good description).

3. **Extract any implicit dependencies.** Legacy rule files often assume
   tooling or environment variables without saying so explicitly (e.g. "run
   the linter" implies a CLI must be installed, "call the API" may imply an
   API key). Surface these as a `dependencies:` list in the new
   frontmatter — see `creating-skills` for the schema — rather than leaving
   them buried in prose.

4. **Write `.skills/<name>/SKILL.md`** with proper frontmatter and a body
   rewritten as clear procedural instructions — not a copy-paste of the
   original file's format-specific cruft (drop `.mdc` fields like `globs`
   or `alwaysApply`; those are Cursor-specific activation hints, not
   content).

5. **Reconcile the original file:**
   - If it was a native `SKILL.md` already sitting in one agent's directory
     (e.g. `.claude/skills/foo/SKILL.md`) and nothing else references it,
     delete it — `dot-skills link` will recreate it as a symlink pointing
     at `.skills/foo/`.
   - If it was a legacy format (`.cursorrules`, `.clinerules`,
     `.windsurfrules`, `.mdc` file) that the agent still reads directly,
     leave a short note in it (or in `AGENTS.md`) pointing at the new
     `.skills/<name>/` location so nothing silently stops working until
     the team fully migrates, then plan its removal.
   - If it was one section inside a larger shared file (`AGENTS.md`,
     `CLAUDE.md`, `copilot-instructions.md`), remove just that section once
     it's been extracted — leave the rest of the file untouched.

6. **Link it out:**

   ```
   npx dot-skills link
   ```

7. **Tell the user what changed** — which file(s) were consumed, what the
   new skill is named, and whether any legacy file still needs manual
   cleanup.

## Don't

- Don't blindly import formatting directives that only make sense in the
  source agent (Cursor's `globs`/`alwaysApply`, Copilot's path-scoped
  `applyTo`) as if they were universal — note them in the SKILL.md body as
  prose if they matter, since not every agent supports scoped activation.
- Don't merge multiple unrelated conventions into one skill just because
  they lived in the same source file.
- Don't fabricate a dependency that isn't actually implied by the original
  instructions.
