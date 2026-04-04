import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSafePath } from '../safety.js';
import type { Tool, ToolResult } from './index.js';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv', 'coverage']);
const MAX_RESULTS = 20;
const MAX_LINE_LENGTH = 200;

interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

function searchInFile(filePath: string, query: string, projectRoot: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(projectRoot, filePath);

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(query)) {
        const trimmedContent = lines[i].trim();
        matches.push({
          file: relativePath,
          line: i + 1,
          content: trimmedContent.length > MAX_LINE_LENGTH
            ? trimmedContent.slice(0, MAX_LINE_LENGTH) + '…'
            : trimmedContent,
        });
      }
    }
  } catch {
    // Skip files that can't be read (binary, permissions, etc.)
  }
  return matches;
}

function searchDirectory(
  dir: string,
  query: string,
  projectRoot: string,
  results: SearchMatch[],
): void {
  if (results.length >= MAX_RESULTS) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) break;

    if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      searchDirectory(fullPath, query, projectRoot, results);
    } else if (entry.isFile()) {
      // Skip binary files by checking extension
      const ext = path.extname(entry.name).toLowerCase();
      const textExtensions = new Set([
        '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.html', '.css',
        '.scss', '.less', '.yaml', '.yml', '.toml', '.xml', '.svg', '.sh',
        '.bash', '.zsh', '.fish', '.py', '.rb', '.go', '.rs', '.java',
        '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.sql', '.env',
        '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc',
        '.eslintrc', '.vue', '.svelte', '.astro',
      ]);

      if (ext === '' || textExtensions.has(ext)) {
        const fileMatches = searchInFile(fullPath, query, projectRoot);
        results.push(...fileMatches);
      }
    }
  }
}

export const searchCodeTool: Tool = {
  definition: {
    name: 'search_code',
    description: 'Search for a text pattern across all project files. Returns matching lines with file paths and line numbers. Excludes node_modules, .git, and other common directories.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory to search in, relative to project root (defaults to ".")',
        },
      },
      required: ['query'],
    },
  },

  async execute(params: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
    const query = params.query as string;
    const searchPath = (params.path as string) || '.';
    const absolutePath = path.resolve(projectRoot, searchPath);

    if (!isSafePath(absolutePath, projectRoot)) {
      return {
        success: false,
        output: '',
        error: `Access denied: ${searchPath} is outside the project directory`,
      };
    }

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        output: '',
        error: `Directory not found: ${searchPath}`,
      };
    }

    const results: SearchMatch[] = [];
    searchDirectory(absolutePath, query, projectRoot, results);

    if (results.length === 0) {
      return { success: true, output: `No matches found for "${query}"` };
    }

    const formatted = results
      .map((m) => `${m.file}:${m.line}: ${m.content}`)
      .join('\n');

    const truncated = results.length >= MAX_RESULTS ? `\n(Results capped at ${MAX_RESULTS} matches)` : '';

    return { success: true, output: formatted + truncated };
  },
};
