import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSafePath } from '../safety.js';
import type { Tool, ToolResult } from './index.js';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv', 'coverage']);

function listDirRecursive(dir: string, prefix: string, depth: number, maxDepth: number): string[] {
  if (depth > maxDepth) return [];

  const lines: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return lines;
  }

  const sorted = entries
    .filter((e) => !IGNORE_DIRS.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (entry.isDirectory()) {
      lines.push(`${prefix}${connector}${entry.name}/`);
      const children = listDirRecursive(
        path.join(dir, entry.name),
        prefix + childPrefix,
        depth + 1,
        maxDepth,
      );
      lines.push(...children);
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }

  return lines;
}

export const listFilesTool: Tool = {
  definition: {
    name: 'list_files',
    description: 'List directory contents as a tree structure. Path should be relative to the project root. Defaults to project root if no path is given.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to the project root (defaults to ".")',
        },
        depth: {
          type: 'string',
          description: 'Maximum depth to recurse (defaults to 3)',
        },
      },
      required: [],
    },
  },

  async execute(params: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
    const dirPath = (params.path as string) || '.';
    const maxDepth = params.depth ? parseInt(params.depth as string, 10) : 3;
    const absolutePath = path.resolve(projectRoot, dirPath);

    if (!isSafePath(absolutePath, projectRoot)) {
      return {
        success: false,
        output: '',
        error: `Access denied: ${dirPath} is outside the project directory`,
      };
    }

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        output: '',
        error: `Directory not found: ${dirPath}`,
      };
    }

    try {
      const tree = listDirRecursive(absolutePath, '', 0, maxDepth);
      return { success: true, output: tree.join('\n') };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: message };
    }
  },
};
