# Contributing to OpenMerlin

Thanks for your interest in contributing! OpenMerlin is open source and we welcome PRs, bug reports, and feature discussions.

---

## Getting Started

### Clone and Install

```bash
git clone https://github.com/your-username/openmerlin-cli
cd openmerlin-cli
npm install
```

### Development Mode

```bash
npm run dev
```

This starts OpenMerlin in development mode so you can test changes as you make them.

---

## Making Changes

### Code Style

- Use **TypeScript** with strict mode enabled
- Follow existing code patterns in `src/`
- Use descriptive variable and function names
- Add comments for complex logic

### Building

Before submitting a PR, ensure your changes compile:

```bash
npm run build
```

### Testing Your Changes

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Test manually in a sample project:**
   ```bash
   cd /path/to/test/project
   npm run dev
   ```
   Then interact with OpenMerlin to verify your feature/fix works as expected.

3. **Run any existing tests** (if applicable):
   ```bash
   npm test
   ```

---

## Submitting a PR

1. **Create a descriptive branch:**
   ```bash
   git checkout -b feature/my-feature-name
   ```

2. **Commit with clear messages:**
   ```bash
   git commit -m "Add [feature/fix]: Brief description of change"
   ```

3. **Push and open a pull request:**
   - Describe what your change does and why
   - Link any related issues
   - Explain how you tested it
   - Reference any breaking changes

**Example PR description:**
```
## What

Added support for Claude models via Anthropic API.

## Why

Users requested better access to latest Claude models for coding tasks.

## How

- Extended `config.ts` to support Anthropic provider configuration
- Added new profile type in model registry
- Tested with Claude 3.5 Sonnet

## Testing

Manually tested with sample project, verified diffs and tool execution work correctly.
```

---

## Good First Issues

Looking for a place to start? Try these:

- Add tests for dangerous command pattern coverage (`safety.ts`)
- Improve error messages and user guidance
- Add support for additional LLM providers
- Enhance CLI help output with better examples
- Documentation improvements
- Bug fixes with clear reproduction steps

---

## Project Structure

```
src/
  index.ts         # CLI bootstrap and prompt loop
  config.ts        # Profile setup, save/load, switching
  scanner.ts       # Project structure + metadata summarization
  agent.ts         # Main LLM loop and tool-call execution
  llm.ts           # OpenAI-compatible HTTP client
  planner.ts       # Plan generation and user approval
  safety.ts        # Path safety and dangerous command rules
  output.ts        # Terminal UI and formatting
  tools/
    index.ts       # Tool registration and dispatch
    listFiles.ts   # List files tool
    readFile.ts    # Read file tool
    runCommand.ts  # Shell command execution
    searchCode.ts  # Code search tool
    writeFile.ts   # File writing tool
```

---

## Key Areas

- **Safety** (`safety.ts`) — File path validation and dangerous command detection. Changes here affect user trust.
- **Tool System** (`tools/`) — Each tool requires confirmation. Keep this secure.
- **LLM Integration** (`llm.ts`, `agent.ts`) — Token management and provider compatibility. Test with multiple models.
- **Output** (`output.ts`) — Terminal formatting and UX. Keep it clean and readable.

---

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for architecture questions
- Check existing issues before opening a new one

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
