import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Config } from './config.js';
import { callLLM } from './llm.js';
import type { LLMMessage } from './llm.js';
import type { SessionMemory } from './historyManager.js';
import * as output from './output.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CHARS_PER_FILE = 8_000;
const DIFF_COMPLETE_MARKER = 'DIFF_COMPLETE';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '__pycache__',
  '.venv', 'venv', 'coverage', '.openmerlin',
]);

// ─── Step 1: Understand Intent ──────────────────────────────────────────────

interface ParsedIntent {
  intent: string;
  files: string[];
}

/**
 * Lightweight LLM call to classify the user's request and identify
 * which project files are most relevant. Keeps the prompt tiny (~500 tokens)
 * so this call is fast and cheap.
 */
export async function understandIntent(
  userInput: string,
  projectContext: string,
  config: Config,
): Promise<ParsedIntent> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are a coding assistant. Given a user request and a project file tree, identify:
1. A short one-line intent summary (what the user wants to do)
2. A list of file paths (relative to root) that are most relevant to this request

Return ONLY a JSON object in this exact format, no other text:
{"intent": "short description", "files": ["path/to/file1.ts", "path/to/file2.ts"]}

Rules:
- Only include files that actually exist in the project tree
- Include files that need to be MODIFIED and files that need to be READ for context
- Maximum 8 files
- If the user is asking a general question (not about specific files), return an empty files array`,
    },
    {
      role: 'user',
      content: `Project structure:\n${projectContext}\n\nUser request: ${userInput}`,
    },
  ];

  try {
    const response = await callLLM(config, messages);
    const content = response.content.trim();

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const intent = typeof parsed.intent === 'string' ? parsed.intent : userInput;
      const files = Array.isArray(parsed.files)
        ? (parsed.files as unknown[]).filter((f): f is string => typeof f === 'string')
        : [];
      return { intent, files };
    }
  } catch {
    output.warn('Intent parsing failed — falling back to tool-based discovery');
  }

  // Fallback: let the agent discover files via tools
  return { intent: userInput, files: [] };
}

// ─── Step 2: Read Relevant Files ────────────────────────────────────────────

/**
 * Read the identified files directly from disk.
 * Much faster than round-tripping through tool calls.
 * Each file is truncated to MAX_CHARS_PER_FILE to control token usage.
 */
export function readRelevantFiles(
  files: string[],
  projectRoot: string,
): string {
  if (files.length === 0) return '';

  const sections: string[] = [];

  for (const filePath of files) {
    const absolutePath = path.resolve(projectRoot, filePath);

    // Safety: must be inside project root
    if (!absolutePath.startsWith(path.resolve(projectRoot))) continue;

    if (!fs.existsSync(absolutePath)) {
      sections.push(`### ${filePath}\n(file not found)\n`);
      continue;
    }

    try {
      let content = fs.readFileSync(absolutePath, 'utf-8');
      const totalChars = content.length;
      const totalLines = content.split('\n').length;

      if (content.length > MAX_CHARS_PER_FILE) {
        content = content.slice(0, MAX_CHARS_PER_FILE) +
          `\n...(truncated — ${totalChars} chars, ${totalLines} lines total)`;
      }

      sections.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`);
    } catch {
      sections.push(`### ${filePath}\n(unable to read)\n`);
    }
  }

  return sections.join('\n');
}

// ─── Step 3: Scan for Additional Context ────────────────────────────────────

/**
 * If no files were identified by intent parsing, collect a list of all
 * project source files so the agent knows what exists.
 * This is lighter than reading file contents — just lists names.
 */
export function listProjectFiles(projectRoot: string, maxDepth: number = 4): string[] {
  const files: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else {
        files.push(relativePath.replace(/\\/g, '/'));
      }
    }
  }

  walk(projectRoot, 0);
  return files;
}

// ─── Step 4: Build Fresh Prompt ─────────────────────────────────────────────

/**
 * Assemble an entirely fresh LLMMessage[] array from scratch.
 * This is the core of the ephemeral-per-turn paradigm —
 * no stale history accumulation, just exactly what the AI needs this turn.
 */
export function buildFreshPrompt(
  userInput: string,
  projectContext: string,
  relevantFileContents: string,
  memory: SessionMemory,
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // ── System message: agent identity + rules ──────────────────────────────
  const systemPrompt = `You are OpenMerlin-CLI, an expert coding assistant running in the user's terminal.

## Project Context
${projectContext}

## Rules
- You can READ files using tools (read_file, list_files, search_code) to understand the codebase.
- You must NEVER write files directly. Instead, express ALL changes as a unified diff.
- Think step-by-step. Read the files you need first, then produce your diff.
- Never modify files outside the project directory.
- Never expose API keys or secrets.
- If a file you need was NOT pre-loaded below, use the read_file tool to fetch it.

## Output Format
After reading files and reasoning about the changes, output a unified diff block for EVERY file you want to change:

\`\`\`diff
--- a/path/to/file.ts
+++ b/path/to/file.ts
@@ -startline,count +startline,count @@
 context line
-removed line
+added line
 context line
\`\`\`

For NEW files use \`--- /dev/null\` as the old path.
For DELETED files use \`+++ /dev/null\` as the new path.
Include 3 lines of context around each change.

When you are done producing all diffs, end your response with the exact marker:
${DIFF_COMPLETE_MARKER}`;

  messages.push({ role: 'system', content: systemPrompt });

  // ── Session memory: compact summary of prior turns ────────────────────
  if (memory.turnCount > 0) {
    let memoryNote = `## Session Context (${memory.turnCount} prior turn${memory.turnCount > 1 ? 's' : ''})\n`;
    memoryNote += memory.compactSummary;

    if (memory.filesModified.length > 0) {
      memoryNote += `\nFiles already modified this session: ${memory.filesModified.join(', ')}`;
    }

    messages.push({ role: 'user', content: memoryNote });
    messages.push({
      role: 'assistant',
      content: 'Understood. I have context from prior turns. What would you like to do next?',
    });
  }

  // ── Pre-loaded file contents ──────────────────────────────────────────
  if (relevantFileContents) {
    messages.push({
      role: 'user',
      content: `## Pre-loaded Files\nThe following files are pre-loaded for your reference:\n\n${relevantFileContents}`,
    });
    messages.push({
      role: 'assistant',
      content: 'I\'ve reviewed the pre-loaded files. Ready to work on your request.',
    });
  }

  // ── Current user request ──────────────────────────────────────────────
  messages.push({ role: 'user', content: userInput });

  return messages;
}
