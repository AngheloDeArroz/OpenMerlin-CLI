# Changelog

## v1.0.6 — Command Execution Security Hardening (Latest)
**Release date: April 25, 2026**

### Overview
This release reinforces the security of the `run_command` tool, introducing stronger protections against destructive commands, shell injection, and sensitive data leakage.

### Security Improvements

#### Expanded Command Blocklist
Improved regex-based detection now supports both Unix and Windows environments (cmd and PowerShell), blocking dangerous operations such as forced deletions, registry changes, and system-level modifications.

```typescript
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f/i,
  /\bRemove-Item\b.*-Recurse/i,
  /\breg\s+(delete|add)\b/i,
  /\bInvoke-Expression\b/i,
];
```

#### Shell Injection and Command Chaining Detection
Stronger protection against chained or hidden malicious commands using operators like `&&`, `||`, and `;`.

```typescript
const SHELL_INJECTION_PATTERNS: RegExp[] = [
  /[;&|]\s*(?:sudo\s+)?(?:rm|del|rd|format)\b/i,
  /\$\(.*(?:rm|del|rd|format)\b/i,
  /`[^']*\b(?:rm|del|rd|format)\b`/i,
];
```

#### Environment Variable Sanitization
Sensitive variables such as API keys, tokens, secrets, and passwords are removed before being passed to child processes.

```typescript
const SENSITIVE_ENV_PATTERNS = [/api[-_]?key/i, /secret/i, /token/i, /password/i];

export function sanitizeEnvironment(): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Only safe variables are forwarded
  }
  return clean;
}
```

#### Smart Risk-Based Execution
Commands are classified dynamically:

- Safe: Read-only commands (e.g., `ls`, `git status`)
- Normal: Requires user confirmation
- Blocked: Immediately rejected

```typescript
export function classifyCommand(cmd: string): CommandRisk {
  // 1. Check shell injection
  // 2. Check dangerous patterns
  // 3. Apply safe / confirm / deny rules
}
```

#### Out-of-Project Path Warnings
Detects and blocks attempts to access or modify files outside the project root directory.

#### Non-TTY Lockdown
Prevents execution of non-safe commands in non-interactive environments.

### Under the Hood
- Complete rewrite of `src/safety.ts`
- Improved secure environment handling in `run_command` execution layer

---

## v1.0.5 — Smart Ephemeral Context Pipeline
**Release date: April 21, 2026**

### Overview
Major architectural upgrade to context handling. The system now uses an ephemeral per-turn pipeline similar to modern AI coding assistants.

### Smarter Context & Fixes
- Replaced rolling history with structured `SessionMemory`
- Improved intent detection before execution
- Rebuilt prompts each turn from direct file reads
- Fixed memory loss bug in `compactToolResults`

### Performance Improvements
- Reduced token usage by 60–75%
- Faster and cheaper LLM calls
- Removed redundant context overhead

### Technical Spotlight

```typescript
export interface SessionMemory {
  turnCount: number;
  filesModified: string[];
  lastIntent: string;
  compactSummary: string;
  lastUpdatedAt?: number;
  contextVersion?: number;
}
```

---

## v1.0.4 — Rich CLI Output Module & Diff Visualization
**Release date: April 04, 2026**

### New Features
- Structured CLI output system
- Colorized logs using `chalk`
- Diff visualization with syntax highlighting
- Grouped and single file diff views
- Multi-agent orchestration logs
- Token usage reporting in table format

### Improvements
- Consistent CLI output styling system
- Improved terminal readability
- Better formatting for logs, hints, and errors
- Enhanced startup banner

### Developer Experience
- Clear feedback for file edits and tool execution
- Improved VS Code diff integration messaging
- Modular output utilities for reuse across CLI

This release significantly improves usability, readability, and developer experience.