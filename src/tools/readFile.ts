import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSafePath } from '../safety.js';
import type { Tool, ToolResult } from './index.js';

const MAX_FILE_OUTPUT = 10_000; 

export const readFileTool: Tool = {
  definition: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. The path should be relative to the project root. Output is truncated to ~10K chars for large files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path relative to the project root',
        },
      },
      required: ['path'],
    },
  },

  async execute(params: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
    const filePath = params.path as string;
    const absolutePath = path.resolve(projectRoot, filePath);

    if (!isSafePath(absolutePath, projectRoot)) {
      return {
        success: false,
        output: '',
        error: `Access denied: ${filePath} is outside the project directory`,
      };
    }

    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        output: '',
        error: `File not found: ${filePath}`,
      };
    }

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const lineCount = content.split('\n').length;

      if (content.length > MAX_FILE_OUTPUT) {
        const truncated = content.slice(0, MAX_FILE_OUTPUT);
        return {
          success: true,
          output: `${truncated}\n\n...(truncated — showing first ${MAX_FILE_OUTPUT} chars of ${content.length} total, ${lineCount} lines)`,
        };
      }

      return { success: true, output: content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: message };
    }
  },
};
