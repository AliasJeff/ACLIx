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
- **Code Writing and Editing:** Reads, writes, and modifies local files. File edits utilize an exact string replacement mechanism rather than full file rewrites.
- **Command Execution:** Runs shell commands and Python scripts directly on the host machine.
- **Security Prompts:** Utilizes an AST-based evaluator to assess shell command risks. Pauses execution to request user confirmation before running operations that modify system state or pose a security risk.

## Core Design

### Agent Orchestration

The system employs a Master Orchestrator pattern combined with the **Re-Act** methodology. For complex tasks, the main agent delegates sub-objectives to specialized, dynamically loaded **Subagents** (e.g., Planner, Explorer, Executor). Subagents operate in isolated contexts with defined read-only or read-write permissions, which prevents conflicting operations and manages token limits efficiently.

### Tools

Tools are native functions provided to the agent to interact with the environment:

- `shell`: Executes operating system commands.
- `python`: Runs Python scripts or inline code.
- `file_read`: Reads file content with pagination limits.
- `file_write`: Overwrites or creates new files.
- `file_edit`: Modifies existing files using whitespace-agnostic exact string replacement.
- `glob`: Locates files based on naming patterns, automatically ignoring heavy directories.
- `grep`: Searches text within files.
- `ask_user`: Requests user input for passwords or missing parameters.
- `web_search`: Searches the web for current information using the Tavily API.
- `read_skill`: Loads the instructions of a specific workflow or Standard Operating Procedure (SOP).

### Hierarchical Memory System

ACLIx manages context through a multi-layered memory architecture:

- **Long-Term Memory (LTM):** Persistent state maintained in Markdown files at the user level (`~/.aclix/ACLI.md`) and project level (`./ACLI.md`), dictating permanent facts, constraints, and preferences.
- **Short-Term Memory (STM):** Session-based conversation history backed by a local SQLite database, allowing state restoration across REPL sessions.
- **Compressed Memory (CM):** An automated rolling summarization system. When token limits or message counts exceed safety thresholds, the engine invokes the LLM to compress historical context into a dense summary, discarding older raw messages to save tokens.
- **_(Under Development)_:** Transitioning from full LTM injection to a local BM25 retrieval-based approach. The system will selectively retrieve and inject only the top 3 most relevant memory fragments per query to further optimize token usage and context relevance.

### Extensible Skills and Rules

The system architecture is highly modular, relying on a filesystem-based plugin model.

- **Skills:** Defined by `SKILL.md` files (alongside optional scripts). They represent pluggable SOPs the agent can learn and execute.
- **Rules:** Defined by `RULE.md` files. They inject specific behavioral constraints into the agent's system prompt dynamically based on the current working directory.
- **Progressive Disclosure:** This architecture leverages progressive disclosure technology. Instead of flooding the initial system prompt with all available instructions, the agent only loads detailed SOPs or specific rule sets when triggered by the user's current context or explicit intent.

### Security and HITL

A built-in security evaluator parses shell commands into an **Abstract Syntax Tree (AST)** to assign risk levels (`low`, `medium`, `high`). It is designed to intercept destructive commands (e.g., `rm -rf /`, `sed -i`), privilege escalations, and fork bombs. This enforces a strict **Human-in-the-Loop (HITL)** architecture, ensuring a mandatory UI confirmation loop before the execution of any medium or high-risk operations.

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
+----------------------+----------------------+-------------+
|     Subagents        |    Security Check    |   Memory    |
| (Planner, Executor)  |    (AST Evaluator)   | (LTM, STM)  |
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
│   │   ├── security/    # Shell command risk evaluator
│   │   ├── skills/      # Skill manager
│   │   ├── subagents/   # Subagent orchestration
│   │   └── tools/       # Tool definitions
│   ├── repl/            # Interactive session engine and slash command registry
│   ├── services/        # Config, database, executor, llm provider, and logger interfaces
│   ├── shared/          # Types, errors, and constants
│   └── ui/              # Terminal prompts and visual components
└── package.json
```
