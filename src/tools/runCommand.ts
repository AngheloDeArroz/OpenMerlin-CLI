import { exec } from 'node:child_process';
import {
  classifyCommand,
  confirmAction,
  sanitizeEnvironment,
  detectOutOfProjectPaths,
} from '../safety.js';
import type { Tool, ToolResult } from './index.js';

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 8_000;
const HALF_OUTPUT = MAX_OUTPUT / 2;

function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  const head = text.slice(0, HALF_OUTPUT);
  const tail = text.slice(-HALF_OUTPUT);
  return `${head}

...(truncated ${text.length - MAX_OUTPUT} chars)...

${tail}`;
}

export const runCommandTool: Tool = {
  definition: {
    name: 'run_command',
    description:
      'Execute a shell command in the project directory. Commands are classified by risk: safe commands (ls, git status, etc.) run automatically, normal commands require user confirmation, and dangerous commands are always blocked. The environment is sanitized to prevent leaking secrets. Has a 30-second timeout.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
      },
      required: ['command'],
    },
  },

  async execute(params: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
    const command = params.command as string;

    // ── Step 1: Classify command risk ──────────────────────────────────────
    const risk = classifyCommand(command);

    if (risk === 'blocked') {
      return {
        success: false,
        output: '',
        error: `Blocked dangerous command: ${command}`,
      };
    }

    // ── Step 2: Warn about out-of-project path references ─────────────────
    const suspiciousPaths = detectOutOfProjectPaths(command, projectRoot);
    if (suspiciousPaths.length > 0) {
      process.stdout.write(
        `  ⚠ Command references paths outside project: ${suspiciousPaths.join(', ')}\n`,
      );
    }

    // ── Step 3: Non-TTY safety — only allow safe commands ─────────────────
    if (!process.stdin.isTTY && risk !== 'safe') {
      return {
        success: false,
        output: '',
        error: 'Cannot run non-safe commands in non-interactive (piped) mode',
      };
    }

    // ── Step 4: Confirmation based on risk ─────────────────────────────────
    // Safe commands auto-approve; normal commands require user confirmation
    if (risk === 'normal') {
      const confirmed = await confirmAction(`Run command: ${command}`);
      if (!confirmed) {
        return { success: false, output: '', error: 'User cancelled command execution' };
      }
    }

    // ── Step 5: Execute with sanitized environment ────────────────────────
    const cleanEnv = sanitizeEnvironment();

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: projectRoot,
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        env: cleanEnv,
      }, (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            resolve({
              success: false,
              output: stdout || '',
              error: `Command timed out after ${TIMEOUT_MS / 1000}s`,
            });
          } else {
            resolve({
              success: false,
              output: stdout || '',
              error: stderr || error.message,
            });
          }
          return;
        }

        const raw = [stdout, stderr].filter(Boolean).join('\n').trim();
        resolve({ success: true, output: truncateOutput(raw) });
      });

      // Stream stdout/stderr to console
      child.stdout?.on('data', (data: Buffer) => {
        process.stdout.write(data);
      });
      child.stderr?.on('data', (data: Buffer) => {
        process.stderr.write(data);
      });
    });
  },
};
