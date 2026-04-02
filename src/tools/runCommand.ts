import { exec } from 'node:child_process';
import { blockDangerousCommand, confirmAction } from '../safety.js';
import type { Tool, ToolResult } from './index.js';

const TIMEOUT_MS = 30_000;

export const runCommandTool: Tool = {
  definition: {
    name: 'run_command',
    description: 'Execute a shell command in the project directory. The command is checked against a blocklist of dangerous patterns and requires user confirmation before execution. Has a 30-second timeout.',
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

    // Check for dangerous commands
    try {
      blockDangerousCommand(command);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: message };
    }

    // Ask user for confirmation
    const confirmed = await confirmAction(`Run command: ${command}`);
    if (!confirmed) {
      return { success: false, output: '', error: 'User cancelled command execution' };
    }

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: projectRoot,
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
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

        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        resolve({ success: true, output });
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
