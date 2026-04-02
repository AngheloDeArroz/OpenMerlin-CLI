# termilynx

A production CLI coding agent that connects to **any AI API** you provide. No built-in SDKs — just raw HTTP to your preferred endpoint.

## Installation

```bash
git clone <repo-url>
cd termilynx
npm install
npm run build
npm link
```

After linking, `termilynx` is available globally on your system.

## First Run

On first launch, you'll be prompted to configure your AI API connection:

```
  First-time setup — configure your AI API connection.

  The API must support OpenAI-compatible chat completions format.
  Examples:
    • OpenAI:    https://api.openai.com/v1
    • Groq:      https://api.groq.com/openai/v1
    • Together:  https://api.together.xyz/v1
    • Ollama:    http://localhost:11434/v1
    • Mistral:   https://api.mistral.ai/v1
    • LM Studio: http://localhost:1234/v1

  API Base URL: https://api.openai.com/v1
  API Key: ****
  Model name: gpt-4o
```

Configuration is saved to `~/.myagent/config.json`. Your API key is never logged or exposed.

## Usage

```bash
# Run from any project directory
cd my-project
termilynx

# Or run in development mode (no build needed)
cd termilynx
npm run dev
```

### Example Session

```
$ termilynx

  ╔═══════════════════════════════╗
  ║       termilynx CLI           ║
  ╚═══════════════════════════════╝
  Project: /home/user/my-app

> add error handling to all async functions in src/api.ts

  Thinking...
  Running tool: read_file → src/api.ts
  Planning...

  ℹ Plan:
    1. Identify all async functions
    2. Wrap each in try/catch
    3. Add typed error logging

  Proceed with plan? (y/n): y

  Editing file: src/api.ts
  --- src/api.ts
  +++ src/api.ts (modified)
  @@ -12,7 +12,11 @@
  -  async function fetchUser(id: string) {
  -    return await db.find(id)
  +  async function fetchUser(id: string) {
  +    try {
  +      return await db.find(id)
  +    } catch (err) {
  +      logger.error('fetchUser failed', { id, err })
  +      throw err
  +    }

  Write changes? (y/n): y
  ✔ Tool complete: write_file
  Done. 3 functions updated.

> exit
  Goodbye.
```

## Supported Commands

termilynx understands natural language. Some examples:

| Request | What it does |
|---|---|
| `add error handling to src/api.ts` | Wraps async functions in try/catch |
| `create a REST API for user management` | Scaffolds routes, controllers, models |
| `find all TODO comments` | Searches the codebase |
| `explain how the auth middleware works` | Reads and explains code |
| `run the test suite` | Executes shell commands (with confirmation) |
| `refactor the database module` | Plans and executes multi-file changes |

### Built-in Commands

| Command | Action |
|---|---|
| `exit` / `quit` | Exit the CLI |
| `clear` | Clear conversation history |
| `config` | Reconfigure API connection |

## Tools

The agent has access to 5 tools:

| Tool | Description |
|---|---|
| `read_file` | Read file contents |
| `write_file` | Write/edit files (shows diff, asks confirmation) |
| `list_files` | List directory tree |
| `search_code` | Grep-style code search |
| `run_command` | Execute shell commands (with confirmation) |

## Safety

### What requires confirmation
- All file writes (shows diff before writing)
- All shell command executions (shows full command)

### What is blocked
- File access outside the project directory
- Dangerous commands: `rm -rf /`, `sudo`, `chmod 777`, `curl | sh`, `format`, etc.

### What is never exposed
- Your API key is never logged, printed, or included in error messages
- Config file permissions are set to owner-only on POSIX systems

## API Compatibility

termilynx works with any API that supports the **OpenAI-compatible chat completions format** (`/v1/chat/completions`). This includes:

- OpenAI
- Anthropic (via OpenAI-compatible proxy)
- Groq
- Together AI
- Ollama (local)
- LM Studio (local)
- Mistral AI
- Any custom endpoint following the OpenAI API spec

## Development

```bash
npm run dev    # Run with tsx (no build needed)
npm run build  # Compile TypeScript
npm start      # Run compiled JS
```

## License

MIT
