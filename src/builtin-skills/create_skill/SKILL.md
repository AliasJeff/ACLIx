---
name: create_skill
description: SOP to scaffold and create a new CLI skill directory adhering to the Anthropic standard.
---

## Purpose

This skill defines how to scaffold a **new Anthropic-style skill** for ACLIx: one directory per skill, `SKILL.md` as the entry file, and optional `scripts/` and `reference/` assets. Follow these steps in order; do not skip user confirmation of scope and naming.

## Standard Operating Procedure

### Step 1 — Confirm scope, name, and description

Use the **`ask_user`** tool to agree with the human on all of the following before creating any files:

1. **Target scope**
   - **Project scope:** `./.aclix/skills/` (relative to the current working directory / project root).
   - **User global scope:** `~/.aclix/skills/` (home directory, portable across projects).

2. **Skill name** — Must be a single filesystem-safe identifier (no spaces; use lowercase letters, digits, and underscores if needed). This name becomes the **folder name** under the chosen scope.

3. **Short description** — One or two sentences that will appear in skill listings and may be mirrored in the new skill’s frontmatter `description` field.

If anything is ambiguous, ask follow-up questions via **`ask_user`** until all three are explicit.

### Step 2 — Create directory layout

Use the **`shell`** tool to create the directory tree (adjust `<scope>` and `<skill_name>` to the values from Step 1):

- `<scope>/<skill_name>/scripts/`
- `<scope>/<skill_name>/reference/`

Example pattern (conceptual):

- `mkdir -p "<scope>/<skill_name>/scripts" "<scope>/<skill_name>/reference"`

Use **absolute paths** when the human prefers them, or resolve paths relative to the confirmed project root. Ensure `mkdir -p` so existing parents are not an error.

### Step 3 — Author `SKILL.md`

Use the **`file_write`** tool to create:

`<scope>/<skill_name>/SKILL.md`

The file **must** include:

1. **YAML frontmatter** at the very top, with at least:
   - `name:` — Should match the folder name (`<skill_name>`) unless the user explicitly requests otherwise.
   - `description:` — The agreed short description from Step 1.

2. **Body** with clear placeholder sections for the skill author to fill in later, for example:
   - `## Purpose`
   - `## Steps` (or `## Workflow`)

Keep the initial body minimal but structured so future edits are straightforward. Do not leave the file without valid frontmatter; ACLIx discovers skills via `SKILL.md` in each skill directory.

### Step 4 — Handoff to the user

After the scaffold exists:

1. **Confirm creation** — State the resolved paths for the skill root, `SKILL.md`, `scripts/`, and `reference/`.
2. **Scripts** — Explain that they may add **Python** (or other) scripts under `scripts/` as needed.
3. **Execution** — Remind them that the Agent should run those scripts with the **`python`** tool (`scriptPath` pointing at the file under `scripts/`), not by improvising shell one-liners unless the user asks otherwise.

## Notes

- One skill = one top-level folder under the scope; entry file is always **`SKILL.md`** at the root of that folder.
- Prefer **`file_read`** / **`file_write`** / **`file_edit`** over shell redirection when editing skill content.
- If a skill with the same folder name already exists, stop and **`ask_user`** whether to abort, use a different name, or overwrite (only proceed if the user explicitly allows overwrite).
