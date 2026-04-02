import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSafePath, confirmAction } from '../safety.js';
import * as output from '../output.js';
import type { Tool, ToolResult } from './index.js';

export const writeFileTool: Tool = {
  definition: {
    name: 'write_file',
    description: 'Write content to a file. Shows a diff of changes and asks for user confirmation before writing. Path should be relative to the project root.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path relative to the project root',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },

  async execute(params: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
    const filePath = params.path as string;
    const newContent = params.content as string;
    const absolutePath = path.resolve(projectRoot, filePath);

    if (!isSafePath(absolutePath, projectRoot)) {
      return {
        success: false,
        output: '',
        error: `Access denied: ${filePath} is outside the project directory`,
      };
    }

    // Read existing content for diff
    let existingContent = '';
    if (fs.existsSync(absolutePath)) {
      try {
        existingContent = fs.readFileSync(absolutePath, 'utf-8');
      } catch {
        // File exists but can't read — treat as new file
      }
    }

    output.editingFile(filePath);
    output.showDiff(filePath, existingContent, newContent);

    const confirmed = await confirmAction('Write changes?');
    if (!confirmed) {
      return { success: false, output: '', error: 'User cancelled the write operation' };
    }

    try {
      // Ensure parent directory exists
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Atomic write: temp file + rename
      const tempPath = absolutePath + '.tmp';
      fs.writeFileSync(tempPath, newContent, 'utf-8');
      fs.renameSync(tempPath, absolutePath);

      return { success: true, output: `File written: ${filePath}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: message };
    }
  },
};
