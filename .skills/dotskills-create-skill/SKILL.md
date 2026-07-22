---
name: dotskills-create-skill
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

## Naming convention

Every skill name follows:

```
<domain>-<action>-<topic>
```

Rules:

- Lowercase only.
- Hyphens (`-`) separate words. No spaces.
- No slashes (`/`), colons (`:`), dots (`.`), or other special characters.
- Concise, descriptive, stable. Once a skill is published, treat its name
  as part of its public interface: other repos may `dot-skills add` it by
  that exact name, so don't rename it lightly later.

- **Domain** – the area the skill belongs to. Use whatever fits the
  project (`document`, `ui`, `backend`, `testing`, `deployment`, `ai`,
  ...). For skills about authoring or managing skills themselves (like
  this one), use `dotskills`.
- **Action** – the verb describing what the skill does (`create`,
  `review`, `generate`, `refactor`, `test`, `deploy`, `import`, `run`,
  ...).
- **Topic** – the specific capability, as specific as helps disambiguate
  it from sibling skills (`functional-spec`, `accessibility`,
  `playwright`, `react`, `skill`, ...).

Examples:

```text
document-create-functional-spec
document-review-consistency
ui-create-component
ui-review-accessibility
testing-run-playwright
testing-ai-evaluation
frontend-refactor-react
backend-generate-api
deployment-vercel-preview
dotskills-create-skill
dotskills-import-skill
```

Avoid:

```text
document/create/spec          ❌ slashes
document:create:spec          ❌ colons
Document Create Spec          ❌ spaces, capitals
document.create.spec          ❌ dots
createSpec                    ❌ no domain, camelCase
generating-invoices           ❌ no domain/topic split
```

If a skill genuinely doesn't fit the shape cleanly (it captures reference
knowledge rather than a single action), pick the closest reasonable
`<domain>-<action>-<topic>` fit rather than abandoning the convention —
choose the action that best matches how an agent would invoke it (e.g.
`use`, `apply`, `reference`).

## Steps

1. **Pick a name** following the naming convention above. The name
   becomes the folder name and must match the `name` field in
   frontmatter.

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

   Also add `version`, `author`, and `repo`, optional but include them
   unless the user says otherwise:

   ```yaml
   version: 1.0.0
   author: Levi Putna
   repo: https://github.com/levi-putna/dot-skills
   ```

   `version` is a semver string. Start new skills at `1.0.0` and bump it
   whenever you meaningfully change the skill's contents. Patch for
   wording fixes, minor for new guidance, major for a rewrite that
   changes how the skill behaves. When users pull a newer copy with
   `dot-skills update`, the version helps them understand what changed,
   so bumping it on edit matters more than picking the right part.
   Prefer the CLI over hand-editing the field:

   ```
   npx dot-skills version <skill-name> patch   # or minor / major / 1.2.3
   ```

   `author` is a plain name or handle. `repo` is a link back to the
   repository this skill's source lives in. That's not necessarily where a user
   installed it from (that provenance is tracked separately per install in the
   lockfile), but where to find the canonical, maintained copy. Both travel
   with the file itself, so they stay attached even if someone copies the raw
   `SKILL.md` around by hand instead of using `dot-skills add`.

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

   If this skill needs *another skill* installed alongside it, declare that
   with `requires` (a separate field from the env/cli `dependencies`
   above). Prefer the CLI, which verifies the target exists and writes the
   correct `id` / `source` / `name`:

   ```
   # Sibling skill in the same .skills/ folder (source defaults to self)
   npx dot-skills require <skill-name> <other-skill-name>

   # Skill published in a different repo
   npx dot-skills require <skill-name> owner/repo/other-skill-name
   ```

   The written entry looks like:

   ```yaml
   requires:
     - id: <other-skill's UUID>
       name: other-skill-name
       # source omitted (or source: self) for same-repo siblings;
       # source: owner/repo[#ref] for cross-repo dependencies
   ```

   The target skill must already have an `id`. `dot-skills add` will pull
   required skills in automatically when someone installs this one.

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
