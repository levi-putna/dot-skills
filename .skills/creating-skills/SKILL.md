---
name: creating-skills
id: e6d0cf52-9004-4575-b260-d5cd8874b8b1
author: Levi Putna
repo: https://github.com/levi-putna/dot-skills
description: >-
  Guide for authoring a new dot-skills-compatible skill. Use when the user
  asks to create a new skill, write a SKILL.md, add a reusable
  instruction/procedure for coding agents, or turn a one-off prompt into
  something reusable across projects.
---

# Creating skills

This project uses [dot-skills](https://github.com/levi-putna/dot-skills) as
its single source of truth for agent skills. Every skill, regardless of
which coding agent will eventually use it (Claude Code, Cursor, GitHub
Copilot, Windsurf, Codex CLI, Gemini CLI), lives in exactly one place:

```
.skills/<skill-name>/SKILL.md
```

**Never** create a skill directly inside `.claude/skills/`,
`.cursor/skills/`, `.github/skills/`, `.windsurf/skills/`, `.codex/skills/`,
or `.gemini/skills/`. Those directories are managed by `dot-skills`; each
skill folder inside them is a symlink (or, on filesystems without symlink
support, a copy) back to `.skills/<skill-name>/`. Editing the linked copy
directly means your edits vanish or drift from the source of truth.

## Steps

1. **Pick a name.** Use kebab-case, verb-first when it describes an action
   (`generating-invoices`) or noun-first when it describes domain knowledge
   (`design-system`). The name becomes the folder name and must match the
   `name` field in frontmatter.

2. **Create the folder and SKILL.md:**

   ```
   .skills/<skill-name>/SKILL.md
   ```

3. **Write the frontmatter.** Required fields:

   ```yaml
   ---
   name: skill-name
   id: <a freshly generated UUID>
   description: >-
     One to three sentences. State what the skill does AND when an agent
     should reach for it. The description is the only thing most agents
     see before deciding to load the full skill, so triggering words and
     concrete trigger phrases matter more than prose quality.
   ---
   ```

   Generate the `id` once, when the skill is first created. It's the
   skill's stable identity, independent of its name or which repo it gets
   copied into. Generate it with `node -e "console.log(crypto.randomUUID())"`
   (or `uuidgen`), and never reuse one across two different skills, and
   never regenerate it for the same skill later (that would make
   `dot-skills` treat it as a different skill for "already installed"
   comparisons). If you're editing an *existing* skill rather than
   creating a new one, leave its `id` untouched.

   Also add `author` and `repo`, optional but include them unless the
   user says otherwise:

   ```yaml
   author: Levi Putna
   repo: https://github.com/levi-putna/dot-skills
   ```

   `author` is a plain name or handle. `repo` is a link back to the
   repository this skill's source lives in, not necessarily where a user
   installed it *from* (that provenance is already tracked separately, per
   install, in the lockfile), but where to find the canonical, maintained
   copy. Both travel with the file itself, so they stay attached even if
   someone copies the raw `SKILL.md` around by hand instead of using
   `dot-skills add`.

   If the skill has setup requirements the user must handle themselves
   (an API key, an environment variable, a CLI tool that must be installed),
   declare them so `dot-skills` can surface instructions right after install:

   ```yaml
   dependencies:
     - type: env
       name: OPENAI_API_KEY
       required: true
       description: Needed to call the OpenAI API for embeddings.
       instructions: >-
         Create a key at https://platform.openai.com/api-keys, then
         export OPENAI_API_KEY=sk-... in your shell profile.
     - type: cli
       name: jq
       required: false
       description: Used to pretty-print JSON output when available.
       instructions: Install via `brew install jq` or `apt install jq`.
   ```

   `type` is `env` (an environment variable) or `cli` (a command that must
   be on `PATH`). Mark `required: false` for nice-to-haves. Never invent a
   dependency the skill doesn't actually need; every entry here becomes a
   real notice shown to a real person.

4. **Write the body.** Plain markdown instructions aimed at the agent that
   will read this skill, not at a human reader of documentation. Be
   specific and procedural: steps, decision points, examples, things to
   avoid. Keep it focused on one capability: if you're describing three
   unrelated procedures, that's three skills.

   For anything bulky (long reference material, scripts, templates), add
   sibling folders instead of bloating SKILL.md itself:

   ```
   .skills/<skill-name>/
     SKILL.md
     references/   # long-form docs, loaded only when needed
     scripts/      # helper scripts the agent can invoke
     assets/       # templates or files used in output
   ```

5. **Link it out to the agents in use.** Run:

   ```
   npx dot-skills link
   ```

   This re-links every skill currently in `.skills/` (including the new
   one) into whichever agents you pick. It prompts interactively,
   pre-selecting any it detects in the project. If the skill declares
   dependencies, `dot-skills` prints the setup notice at this point too;
   read it back to the user.

6. **Commit `.skills/`.** The per-agent directories it's linked into may or
   may not be gitignored depending on the project's conventions (check
   before assuming either way), but `.skills/` itself is always the
   canonical, version-controlled copy.

## Writing a good description

The `description` field is what decides whether an agent ever loads this
skill at all. Bad: `"Helps with writing."` Good: `"Rewrite or draft text in
clear, natural language. Use when asked to improve writing, edit copy,
rewrite content, simplify language, or make text sound more human and less
AI-generated."` Name the triggering phrases a user would actually type.

## If you're not sure this should be a skill

Skills are for procedures worth reusing across sessions or projects. A
one-off instruction that only applies to the current message doesn't need
to become a skill. Just do the task.
