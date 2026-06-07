import * as path from 'node:path';
import * as readline from 'node:readline';

// ─── Command Risk Levels ────────────────────────────────────────────────────

export type CommandRisk = 'safe' | 'normal' | 'blocked';

// ─── Layer 1: Shell Injection / Chaining Detection ──────────────────────────
// Catches attempts to chain a destructive command after a benign one:
//   echo hi && rm -rf /
//   echo $(rm -rf /)
//   echo `rm -rf /`

const DESTRUCTIVE_VERBS =
  'rm|del|rd|rmdir|format|mkfs|dd|shred|shutdown|reboot|Stop-Computer|Restart-Computer|Remove-Item';

const SHELL_INJECTION_PATTERNS: RegExp[] = [
  // Chaining via ;, &&, ||, | followed by destructive command
  new RegExp(`[;&|]\s*(?:sudo\\s+)?(?:${DESTRUCTIVE_VERBS})\\b`, 'i'),
  // Command substitution $(...) containing destructive command
  new RegExp(`\\$\\(.*\\b(?:${DESTRUCTIVE_VERBS})\\b`, 'i'),
  // Backtick substitution `...` containing destructive command
  new RegExp(`\`[^']*\\b(?:${DESTRUCTIVE_VERBS})\\b`, 'i'),
];

// ─── Layer 2: Dangerous Command Patterns (Unix + Windows) ───────────────────

const DANGEROUS_PATTERNS: RegExp[] = [
  // === Unix destructive ===
  /\brm\s+-[a-z]*r[a-z]*f/i,         // rm -rf, rm -rfi, etc.
  /\brm\s+-[a-z]*f[a-z]*r/i,         // rm -fr
  /\brm\s+-rf\s+\//,                  // rm -rf /
  /\brm\s+-rf\s+\\/,                  // rm -rf \ (Windows-style)
  /\bfind\b.*\s-delete\b/,            // find / -delete
  /\bshred\b/,                        // shred
  /\bmkfs\b/,                         // mkfs.*
  /\bdd\s+if=/,                       // dd if=
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // fork bomb
  /\bsudo\b/,                         // sudo (privilege escalation)
  /\bchmod\s+777/,                    // chmod 777
  /\bchown\s+-R\b/,                   // recursive chown
  /\bshutdown\b/,                     // shutdown
  /\breboot\b/,                       // reboot
  /\bkill\s+-9\s+1\b/,               // kill init

  // === Unix remote code execution ===
  /\bcurl\b.*\|\s*(sh|bash|zsh|python|node)/,
  /\bwget\b.*\|\s*(sh|bash|zsh|python|node)/,

  // === Windows destructive (cmd.exe) ===
  /\bformat\s+[a-zA-Z]:/i,           // format C:
  /\bdel\s+\/s/i,                     // del /s (recursive delete)
  /\brd\s+\/s/i,                      // rd /s (recursive rmdir)
  /\brmdir\s+\/s/i,                   // rmdir /s

  // === Windows destructive (PowerShell) ===
  /\bRemove-Item\b.*-Recurse/i,       // Remove-Item -Recurse -Force
  /\bStop-Process\b/i,                // kill processes
  /\bStop-Computer\b/i,               // shutdown
  /\bRestart-Computer\b/i,            // reboot
  /\bClear-Content\b/i,               // clear file contents
  /\bSet-ExecutionPolicy\b/i,         // change script execution policy

  // === Windows system manipulation ===
  /\breg\s+(delete|add)\b/i,          // registry edits
  /\bnet\s+user\b/i,                  // user account manipulation
  /\bnet\s+stop\b/i,                  // stopping services
  /\bschtasks\s+\/(create|delete)/i,  // scheduled tasks
  /\bNew-Service\b/i,                 // creating services
  /\bsc\s+(delete|stop)\b/i,          // service control

  // === Remote code execution via PowerShell ===
  /\bInvoke-Expression\b/i,           // Invoke-Expression
  /\biex\s/i,                         // iex alias
  /\bInvoke-WebRequest\b.*\|\s*(iex|Invoke-Expression)/i,
  /\bDownloadString\b/i,              // .NET WebClient → exec
  /\bStart-BitsTransfer\b.*\|\s*(iex|Invoke-Expression)/i,
];

// ─── Layer 3: Safe Commands (auto-approve, no confirmation needed) ──────────

const SAFE_COMMAND_PREFIXES: string[] = [
  // Listing / reading
  'ls', 'dir', 'cat', 'type', 'head', 'tail', 'echo', 'pwd',
  'wc', 'tree',
  // Searching
  'grep', 'find', 'which', 'where', 'rg', 'fd',
  // Git read-only
  'git status', 'git log', 'git diff', 'git branch', 'git remote',
  'git show', 'git stash list', 'git tag',
  // Version checks
  'node --version', 'node -v',
  'npm --version', 'npm -v',
  'npx --version', 'npx -v',
  'tsc --version', 'tsc -v',
  'python --version', 'python -V',
  'python3 --version', 'python3 -V',
  'go version', 'java -version', 'rustc --version',
  // Package info
  'npm list', 'npm ls', 'npm outdated', 'npm view',
  'pip list', 'pip show',
  // Misc safe
  'date', 'whoami', 'hostname', 'uname',
  'Get-Date', 'Get-Location', 'Get-ChildItem',
];

// ─── Sensitive Environment Variable Patterns ────────────────────────────────

const SENSITIVE_ENV_PATTERNS: RegExp[] = [
  /api[-_]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /passwd/i,
  /credential/i,
  /auth/i,
  /private[-_]?key/i,
  /access[-_]?key/i,
  /session/i,
  /jwt/i,
  /bearer/i,
  /connection[-_]?string/i,
  /database[-_]?url/i,
];

// Keys that match a sensitive pattern but are actually safe system variables
const ENV_ALLOWLIST = new Set([
  'AUTH_TYPE',
  'TERM_SESSION_ID',
  'SESSION_MANAGER',
  'DBUS_SESSION_BUS_ADDRESS',
  'XDG_SESSION_TYPE',
  'XDG_SESSION_CLASS',
  'XDG_SESSION_ID',
  'XDG_SESSION_DESKTOP',
  'DESKTOP_SESSION',
  'SSH_AUTH_SOCK',
  'VSCODE_IPC_HOOK_CLI',
]);

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify a command into risk tiers:
 * - `safe`    → auto-approve, no confirmation needed
 * - `normal`  → requires user confirmation
 * - `blocked` → rejected immediately, never executed
 */
export function classifyCommand(cmd: string): CommandRisk {
  const trimmed = cmd.trim();

  // Check shell injection / chaining first
  for (const pattern of SHELL_INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) return 'blocked';
  }

  // Check individual dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) return 'blocked';
  }

  // Check safe commands
  for (const prefix of SAFE_COMMAND_PREFIXES) {
    if (trimmed === prefix || trimmed.startsWith(prefix + ' ')) {
      return 'safe';
    }
  }

  return 'normal';
}

/**
 * Legacy function — throws if command is dangerous.
 * Prefer `classifyCommand()` for new code.
 */
export function blockDangerousCommand(cmd: string): void {
  const risk = classifyCommand(cmd);
  if (risk === 'blocked') {
    throw new DangerousCommandError(cmd);
  }
}

/**
 * Detect absolute paths in a command that reference locations outside the project root.
 * Returns an array of suspicious path strings found.
 */
export function detectOutOfProjectPaths(cmd: string, projectRoot: string): string[] {
  const normalizedRoot = path.resolve(projectRoot).toLowerCase();
  const suspicious: string[] = [];

  // Windows absolute paths (C:\..., D:\...)
  const windowsAbsPath = /[A-Z]:\\[^\s"'|;&]+/gi;
  for (const match of cmd.matchAll(windowsAbsPath)) {
    const p = path.resolve(match[0]).toLowerCase();
    if (!p.startsWith(normalizedRoot)) {
      suspicious.push(match[0]);
    }
  }

  // Unix sensitive system paths
  const unixSysPaths = /\/(?:etc|usr|var|home|root|tmp|opt|boot|sys|proc|dev|sbin|bin)\b[^\s"'|;&]*/g;
  for (const match of cmd.matchAll(unixSysPaths)) {
    suspicious.push(match[0]);
  }

  return suspicious;
}

/**
 * Create a sanitized copy of process.env that strips variables
 * matching sensitive patterns (API keys, tokens, secrets, etc.).
 * Prevents child processes from inheriting credentials.
 */
export function sanitizeEnvironment(): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;

    // Always keep allowlisted system variables
    if (ENV_ALLOWLIST.has(key)) {
      clean[key] = value;
      continue;
    }

    const isSensitive = SENSITIVE_ENV_PATTERNS.some((p) => p.test(key));
    if (!isSensitive) {
      clean[key] = value;
    }
  }
  return clean;
}

// ─── Path Safety ────────────────────────────────────────────────────────────

export function isSafePath(targetPath: string, projectRoot: string): boolean {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(projectRoot);

  // Target must be within the project root
  return resolved.startsWith(root + path.sep) || resolved === root;
}

// ─── User Confirmation ─────────────────────────────────────────────────────

export function confirmAction(description: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(`  ${description} (y/n): `);

    if (process.stdin.isTTY) {
      // Pause any existing listeners, then enter raw mode for a single keypress
      process.stdin.pause();
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onData = (data: Buffer): void => {
        const char = data.toString().charAt(0).toLowerCase();

        // Ignore non-printable keys (arrows, escape sequences, etc.)
        if (char !== 'y' && char !== 'n') {
          return;
        }

        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();

        process.stdout.write(char + '\n');
        resolve(char === 'y');
      };

      process.stdin.on('data', onData);
    } else {
      // Non-TTY fallback (piped input) — default to DENY for safety
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
      });
      rl.once('line', (line) => {
        rl.close();
        const normalized = line.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes');
      });
    }
  });
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class DangerousCommandError extends Error {
  constructor(command: string) {
    super(`Blocked dangerous command: ${command}`);
    this.name = 'DangerousCommandError';
  }
}
