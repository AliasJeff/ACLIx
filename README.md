# ACLIx

English | [简体中文](./README_zh.md)

---

<img src="./assets/logo.jpg" alt="ACLIx" style="zoom:50%;" />

<p align="center">
    <a href="https://www.npmjs.com/package/@aliasjeff/acli">
        <img src="https://img.shields.io/npm/v/@aliasjeff/acli.svg" alt="npm version">
    </a>
    <a href="https://nodejs.org">
        <img src="https://img.shields.io/node/v/@aliasjeff/acli.svg" alt="Node.js Version">
    </a>
    <a href="https://opensource.org/licenses/MIT">
        <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
    </a>
</p>

**ACLIx** is a command-line interface assistant that utilizes large language models to execute tasks and answer queries within a terminal environment. It operates as an autonomous agent capable of interacting with the host operating system, local file system, and external web services.

## Demo

<img src="./assets/acli-intro.gif" alt="ACLIx-intro" style="zoom:80%;" />

<p align="center">acli-intro</p>

<img src="./assets/acli-task.gif" alt="ACLIx-task" style="zoom:80%;" />

<p align="center">acli-task</p>

## Features

- **Question and Answering:** Processes user queries using local file context or real-time web search.
- **Code Writing and Editing:** Reads, writes, and modifies local files. File edits utilize an exact string replacement mechanism safeguarded by **Optimistic Locking (Read-Before-Write)** to prevent hallucinated overwrites.
- **Command Execution & Output Pagination:** Runs shell commands and Python scripts directly on the host machine. Long outputs are automatically truncated and cached, allowing the agent to read full logs on demand without context pollution.
- **Complex Task Orchestration:** Decomposes complex tasks into a **Persistent Task Graph (DAG)**.
- **Workspace Isolation:** Spawns subagents in isolated **Git Worktree sandboxes** to ensure safe, conflict-free parallel execution.
- **Security Prompts:** Utilizes an AST-based evaluator to assess shell command risks. Pauses execution to request user confirmation before running operations that modify system state or pose a security risk.

## Core Design

### Agent Orchestration

The system employs a Master Orchestrator pattern combined with the **Re-Act** methodology. For complex tasks, the main agent maps out a **Persistent Task Graph (DAG)** backed by SQLite. It then delegates sub-objectives to specialized, dynamically loaded **Subagents** (e.g., Planner, Explorer, Executor).

To prevent file conflicts and manage token limits efficiently, Subagents operate in physically isolated **Git Worktree Sandboxes**. This allows true parallel execution. Once subtasks are completed, the Master Orchestrator reviews and merges the worktree back into the main branch.

### Tools

Tools are native functions provided to the agent to interact with the environment:

- `shell`: Executes operating system commands.
- `python`: Runs Python scripts or inline code.
- `file_read`: Reads file content with pagination limits and returns a real-time `FileHash`.
- `file_write`: Overwrites or creates new files (mandates a valid `expectedHash`).
- `file_edit`: Modifies existing files using whitespace-agnostic exact string replacement (mandates a valid `expectedHash`).
- `glob`: Locates files based on naming patterns, automatically ignoring heavy directories.
- `grep`: Searches text within files.
- `ask_user`: Requests user input for passwords or missing parameters.
- `web_search`: Searches the web for current information using the Tavily API.
- `read_skill`: Loads the instructions of a specific workflow or Standard Operating Procedure (SOP).
- `read_tool_output`: Retrieves paginated full logs for truncated long tool outputs cached in the database.
- `manage_task`: Manages the state of the persistent Task Graph (DAG) for long-term planning.
- `merge_worktree`: Merges isolated Subagent Git worktrees back into the main branch.

### Hierarchical Memory System

ACLIx manages context through a multi-layered memory architecture:

- **Long-Term Memory (LTM):** Persistent state maintained in Markdown files at the user level (`~/.aclix/ACLI.md`) and project level (`./ACLI.md`), dictating permanent facts, constraints, and preferences.
- **Short-Term Memory (STM):** Session-based conversation history backed by a local SQLite database, allowing state restoration across REPL sessions.
- **Compressed Memory (CM):** An automated rolling summarization system. When token limits or message counts exceed safety thresholds, the engine invokes the LLM to compress historical context into a dense summary, discarding older raw messages to save tokens.
- **BM25 Retrieval:** Transitioning from full LTM injection to a local BM25 retrieval-based approach. The system will selectively retrieve and inject only the top 3 most relevant memory fragments per query to further optimize token usage and context relevance.

### Extensible Skills and Rules

The system architecture is highly modular, relying on a filesystem-based plugin model.

- **Skills:** Defined by `SKILL.md` files (alongside optional scripts). They represent pluggable SOPs the agent can learn and execute.
- **Rules:** Defined by `RULE.md` files. They inject specific behavioral constraints into the agent's system prompt dynamically based on the current working directory.
- **Progressive Disclosure:** This architecture leverages progressive disclosure technology. Instead of flooding the initial system prompt with all available instructions, the agent only loads detailed SOPs or specific rule sets when triggered by the user's current context or explicit intent.

### Security and HITL

1. **Command Risk Evaluation:** All shell commands are parsed into an **Abstract Syntax Tree (AST)** and assigned a risk level (low, medium, high). Destructive operations (e.g., rm -rf /, sed -i), privilege escalations, and fork bombs are automatically flagged. Medium- and high-risk commands require explicit user confirmation before execution.
2. **Optimistic Locking (CAS):** File modifications enforce a strict Compare-And-Swap mechanism. The agent must read a file to obtain its current `FileHash` before editing. This completely eliminates stale overwrites and hallucinated code modifications.
3. **Automatic File Snapshots:** Before modifying any file, an invisible SQLite snapshot is created, enabling one-click rollback via `/undo`. This ensures recoverability and prevents accidental data loss.
4. **Prompt Injection Protection and Data Sanitization:** All untrusted inputs are wrapped in `<untrusted_data>` to prevent prompt injection attacks. Sensitive information is automatically sanitized before processing or logging, preserving data privacy.

## Usage

### Installation

Requires Node.js v23 or higher.

```bash
npm install -g @aliasjeff/acli
```

### Execution Modes

- **Command Mode:** Triggered by `acli chat "<query>"`. It processes a single user request, executes the task, and exits the process upon completion.
- **REPL Mode:** Triggered by running `acli` without arguments. It starts an interactive shell session. Users can maintain conversational context and utilize slash commands (e.g., `/history`, `/compact`, `/rules`, `/skills`, `/config`, `/clear`, `/exit`).

### Commands

**Initialization:**

Set the LLM provider, select a model, and input API keys.

```bash
acli onboard
```

**Interactive Session (REPL Mode):**

Start an ongoing conversation with context retention.

```bash
acli
```

**Single Task (Command Mode):**

Execute a single objective and exit.

```bash
acli chat "Create a text file containing the current date"
```

**Configuration Management:**

Inspect or update the current configuration parameters.

```bash
acli config
```

## Architecture & Directory Structure

ACLIx is structured into distinct layers to separate CLI interfacing, core agent logic, and external services.

```plaintext
+-----------------------------------------------------------+
|                        User Input                         |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------+-----------------------------+
|                 CLI / REPL Interface                      |
|  (Session Management, Command Parsing, Terminal UI)       |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                     Master Orchestrator                   |
|                   (Persistent Task Graph)                 |
+----------------------+----------------------+-------------+
|     Subagents        |    Security Check    |   Memory    |
| (Worktree Isolation) |   (AST / CAS Locks)  | (LTM, STM)  |
+----------------------+----------------------+-------------+
                              |
     +------------------------+------------------------+
     |                        |                        |
     v                        v                        v
+-----------+         +---------------+        +--------------+
| LLM APIs  |         |     Tools     |        | Extensibility|
| (OpenAI,  |         | (Shell, File, |        | (Skills,     |
| Anthropic)|         |  Web Search)  |        |  Rules)      |
+-----------+         +---------------+        +--------------+
                              |
                              v
              +-------------------------------+
              |   Local OS & File System      |
              +-------------------------------+
```

### Directory Tree

```plaintext
.
├── bin/                 # CLI entry point
├── src/
│   ├── cli/             # Command parsers, middlewares, and interrupt handling
│   ├── core/            # Core system logic
│   │   ├── agent/       # Chat workflow and prompt generation
│   │   ├── context/     # Runtime context tracking
│   │   ├── memory/      # Token counting and context compression
│   │   ├── rules/       # Rule manager
│   │   ├── security/    # Shell command risk evaluator and CAS locks
│   │   ├── skills/      # Skill manager
│   │   ├── subagents/   # Subagent orchestration and worktree isolation
│   │   └── tools/       # Tool definitions
│   ├── repl/            # Interactive session engine and slash command registry
│   ├── services/        # Config, database, executor, llm provider, and logger interfaces
│   ├── shared/          # Types, errors, and constants
│   └── ui/              # Terminal prompts and visual components
└── package.json
```
