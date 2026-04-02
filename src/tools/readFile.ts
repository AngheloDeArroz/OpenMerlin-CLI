import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSafePath } from '../safety.js';
import type { Tool, ToolResult } from './index.js';

export const readFileTool: Tool = {
  definition: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. The path should be relative to the project root.',
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
      return { success: true, output: content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: message };
    }
  },
};
