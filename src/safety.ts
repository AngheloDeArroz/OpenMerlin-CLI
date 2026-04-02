import * as path from 'node:path';
import * as readline from 'node:readline';

const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+\\/,
  /\bsudo\b/,
  /chmod\s+777/,
  /curl\s+.*\|\s*sh/,
  /curl\s+.*\|\s*bash/,
  /wget\s+.*\|\s*sh/,
  /wget\s+.*\|\s*bash/,
  /mkfs\./,
  /dd\s+if=/,
  /:(){ :\|:& };:/,
  /format\s+[a-zA-Z]:/i,
  /del\s+\/s\s+\/q\s+[a-zA-Z]:\\/i,
  /rd\s+\/s\s+\/q\s+[a-zA-Z]:\\/i,
];

export function confirmAction(description: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`  ${description} (y/n): `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

export function isSafePath(targetPath: string, projectRoot: string): boolean {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(projectRoot);

  // Target must be within the project root
  return resolved.startsWith(root + path.sep) || resolved === root;
}

export class DangerousCommandError extends Error {
  constructor(command: string) {
    super(`Blocked dangerous command: ${command}`);
    this.name = 'DangerousCommandError';
  }
}

export function blockDangerousCommand(cmd: string): void {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new DangerousCommandError(cmd);
    }
  }
}
