# ACLIx

English | [简体中文](./README_zh.md)

---

![ACLIx](./assets/logo.jpg)

**ACLIx** is a command-line interface assistant that utilizes large language models to execute tasks and answer queries within a terminal environment. It operates as an autonomous agent capable of interacting with the host operating system, local file system, and external web services.

### Features

- **Code Writing and Editing:** Reads, writes, and modifies local files. File edits utilize an exact string replacement mechanism rather than full file rewrites.
- **Question and Answering:** Processes user queries using local file context or real-time web search.
- **Command Execution:** Runs shell commands and Python scripts directly on the host machine.
- **Safety Prompts:** Utilizes an AST-based evaluator to assess shell command risks. Pauses execution to request user confirmation before running operations that modify system state or pose a security risk.

### Core Concepts

#### Agent and Re-Act

The system uses an agentic workflow based on the Re-Act (Reasoning and Acting) pattern. For a given task, the agent generates a reasoning step to determine the necessary action, executes one or more tools, and evaluates the output. This loop continues iteratively until the objective is reached or the maximum step limit is hit.

#### Tools

Tools are native functions provided to the agent to interact with the environment:

- `shell`: Executes operating system commands.
- `python`: Runs Python scripts or inline code.
- `file_read`: Reads file content with pagination limits.
- `file_write`: Overwrites or creates new files.
- `file_edit`: Modifies existing files using exact string replacement.
- `glob`: Locates files based on naming patterns.
- `grep`: Searches text within files.
- `ask_user`: Requests user input for passwords or missing parameters.
- `web_search`: Searches the web for current information using the Tavily API.
- `read_skill`: Loads the instructions of a specific skill.

#### Skills

...

#### Rules

...

#### Memory and Compression

...

#### Extensibility

The system supports extensibility without modifying the source code. Users can define custom skills and rules by creating `.aclix/skills` or `.aclix/rules` directories. These directories can be placed in the user's home directory for global scope or in the current working directory for project-specific scope. Project-level configurations override user-level configurations.

### Usage

#### Install Using npm (node v23)

`npm install -g @aliasjeff/acli`

#### Execution Modes

- **Command Mode:** Triggered by `acli chat "<query>"`. It processes a single user request, executes the task, and exits the process upon completion.
- **REPL Mode:** Triggered by running `acli` without arguments. It starts an interactive shell session. Users can maintain conversational context and utilize slash commands (e.g., `/history`, `/compact`, `/rules`, `/skills`, `/config`, `/clear`, `/exit`).

#### Commands

**Initialization:**

Set the LLM provider, select a model, and input API keys.

```
acli onboard
```

**Single Task (Command Mode):**

Execute a single objective and exit.

```
acli chat "Create a text file containing the current date"
```

**Interactive Session (REPL Mode):**

Start an ongoing conversation with context retention.

```
acli
```

**Configuration Management:**

Inspect or update the current configuration parameters.

```
acli config
```

### Architecture & Directory Structure

The project is structured into distinct layers to separate concerns:

- **CLI Layer:** Parses command-line arguments, handles user inputs, process interrupts, and terminal rendering.
- **Core Layer:** Contains the agent execution logic, prompt construction, security evaluation, token management, and tool definitions.
- **REPL Layer:** Manages the interactive session state and slash command routing.
- **Services Layer:** Integrates external dependencies, including SQLite for database storage, local configuration management, host process execution, and language model providers via the Vercel AI SDK.

```
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
│   │   └── tools/       # Tool definitions
│   ├── repl/            # Interactive session engine and slash command registry
│   ├── services/        # Config, database, executor, llm provider, and logger interfaces
│   ├── shared/          # Types, errors, and constants
│   └── ui/              # Terminal prompts and visual components
└── package.json
```
