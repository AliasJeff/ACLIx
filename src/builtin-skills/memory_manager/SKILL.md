---
name: memory_manager
description: Standard Operating Procedure for the agent to retrieve and update its hierarchical memory system.
---

## Purpose

Provide a reliable, repeatable procedure for an agent to **inspect** and **update** its Hierarchical Memory System:

- **Long-Term Memory (LTM)**: permanent user/project instructions and facts
- **Compressed Memory (CM)**: rolling historical summary inside the session
- **Short-Term Memory (STM)**: recent uncompressed messages inside the session

## Standard Operating Procedure

### Key facts (read first)

- **LTM is already injected** into your **System Prompt** as `<long_term_memory>...</long_term_memory>`.
- Treat `<long_term_memory>` as **permanent instructions and facts**. You **MUST prioritize and adhere** to it over ephemeral conversation text.

---

### 1) Inspect current STM/CM state (capacity/volume)

Use this when you need to answer questions like:

- “How many messages are in STM right now?”
- “Is Compressed Memory (historical summary) present?”
- “Has rolling compression already happened?”

**Procedure**

1. **Read the injected anchor** at the very top of the skill payload returned by `read_skill`. Extract the absolute path from:
   - `[Skill Directory: <absolute_path>]`
   - Call it **`INJECTED_SKILL_DIR`** (the directory that contains this skill’s `SKILL.md`).

2. **Invoke the `python` tool** with:
   - **`scriptPath`**: `INJECTED_SKILL_DIR` + `/scripts/inspect.py`
   - **`args`**: one argument, the target **`cwd`** (string)
   - Do **not** use the shell for this inspection.

3. **Interpret the output**:
   - The script prints a single JSON object, including:
     - `cwd`
     - `messageCount`
     - `compressedMemoryPresent` (CM)
     - `shortTermMessageCount` (STM)

---

### 2) Update / remember new Long-Term Memory (CRITICAL)

**CRITICAL RULE:** To UPDATE or REMEMBER new long-term information, you MUST edit the LTM markdown files directly using `file_edit` or `file_write`.

- **Global (user-level) LTM**: `~/.aclix/ACLI.md`
  - Use for: stable user preferences, writing style, tooling preferences, personal constraints, recurring workflows.
- **Project (cwd-level) LTM**: `./ACLI.md`
  - Use for: repo-specific rules, architecture constraints, domain facts, deployment instructions, team conventions.

**Tooling requirements**

- If the file exists and you are changing parts of it: use **`file_edit`** with an exact `oldString` match.
- If the file does not exist or you need to create/overwrite intentionally: use **`file_write`**.
- Do **not** use shell redirection (`echo >`, `cat >`, etc.).

---

### 3) What NOT to do

- Do not “store memory” only by restating it in chat; that is **not** durable.
- Do not modify LTM via shell commands.
- Do not invent a memory format; always keep LTM as clear markdown in the two files above.

