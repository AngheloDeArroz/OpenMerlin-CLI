import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { Config } from './config.js';
import { callLLM, LLMError } from './llm.js';
import type { LLMMessage, ToolCall } from './llm.js';
import { getReadOnlyToolDefinitions, executeTool } from './tools/index.js';
import { generatePlan, presentPlan } from './planner.js';
import { estimateHistoryTokens, updateSessionMemory } from './historyManager.js';
import type { SessionMemory } from './historyManager.js';
import { understandIntent, readRelevantFiles, buildFreshPrompt } from './contextBuilder.js';
import { parseDiff, applyParsedDiffs, reconstructFile } from './diffParser.js';
import type { ParsedFileDiff } from './diffParser.js';
import { confirmAction } from './safety.js';
import * as output from './output.js';

const MAX_TOOL_ITERATIONS = 20;
const DIFF_COMPLETE_MARKER = 'DIFF_COMPLETE';

// ─── Main Entry Point ───────────────────────────────────────────────────────

export interface AgentResult {
  memory: SessionMemory;
}

export async function runAgent(
  userInput: string,
  memory: SessionMemory,
  config: Config,
  projectContext: string,
  projectRoot: string,
): Promise<AgentResult> {
  output.thinking();

  // ═══════════════════════════════════════════════════════════════════════════
  //  STEP 1 — Understand intent & identify relevant files
  // ═══════════════════════════════════════════════════════════════════════════

  output.info('Analyzing request...');
  const { intent, files: relevantFiles } = await understandIntent(
    userInput,
    projectContext,
    config,
  );

  if (relevantFiles.length > 0) {
    output.info(`Intent: ${intent}`);
    output.info(`Relevant files: ${relevantFiles.join(', ')}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STEP 2 — Read relevant files directly from disk
  // ═══════════════════════════════════════════════════════════════════════════

  const fileContents = readRelevantFiles(relevantFiles, projectRoot);

  // ═══════════════════════════════════════════════════════════════════════════
  //  STEP 3 — Build a fresh prompt (no stale history)
  // ═══════════════════════════════════════════════════════════════════════════

  // Detect complex tasks and generate a plan
  const complexKeywords = [
    'refactor', 'restructure', 'migrate', 'convert', 'implement',
    'add feature', 'new feature', 'create', 'build', 'redesign',
    'all files', 'all functions', 'entire', 'across',
  ];
  const isComplex = complexKeywords.some((kw) =>
    userInput.toLowerCase().includes(kw),
  );

  let effectiveInput = userInput;

  if (isComplex) {
    const plan = await generatePlan(userInput, projectContext, config);
    if (plan && plan.length > 0) {
      const proceed = await presentPlan(plan, projectRoot);
      if (!proceed) {
        output.info('Plan cancelled.');
        return { memory };
      }
      // Append the approved plan to the user's input
      effectiveInput = `${userInput}\n\nApproved plan — execute step by step:\n${plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }
  }

  // Build the ephemeral message array from scratch
  const messages = buildFreshPrompt(
    effectiveInput,
    projectContext,
    fileContents,
    memory,
  );

  const inputTokens = estimateHistoryTokens(messages);
  output.tokenEstimate(inputTokens);

  // ═══════════════════════════════════════════════════════════════════════════
  //  STEP 4 — Execute (tool loop + final response)
  // ═══════════════════════════════════════════════════════════════════════════

  const readOnlyTools = getReadOnlyToolDefinitions();
  let iterations = 0;
  let finalResponse = '';

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    let response;
    try {
      response = await callLLM(config, messages, readOnlyTools);
    } catch (err) {
      if (err instanceof LLMError) {
        output.error(`LLM API error: ${err.message}`);
      } else {
        output.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return { memory };
    }

    // If there are tool calls (read-only), execute them
    if (response.toolCalls && response.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content || '',
      });

      // Patch tool_calls onto the message for API compatibility
      const lastMsg = messages[messages.length - 1] as LLMMessage & { tool_calls?: object[] };
      lastMsg.tool_calls = response.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));

      // Execute each read-only tool call
      for (const toolCall of response.toolCalls) {
        output.toolStart(`${toolCall.name} → ${formatToolArgs(toolCall.arguments)}`);

        const result = await executeTool(toolCall.name, toolCall.arguments, projectRoot);

        if (result.success) {
          output.toolDone(toolCall.name);
        } else {
          output.error(result.error || 'Tool execution failed');
        }

        messages.push({
          role: 'tool',
          content: result.success
            ? result.output
            : `Error: ${result.error || 'Unknown error'}`,
          tool_call_id: toolCall.id,
        });
      }

      continue; // Loop back to get AI's next response
    }

    // No tool calls — this is the final response
    if (response.content) {
      finalResponse = response.content;
    }
    break;
  }

  if (iterations >= MAX_TOOL_ITERATIONS) {
    output.warn(`Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}). Stopping.`);
  }

  if (!finalResponse) {
    output.error('No response from AI.');
    return { memory };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — Apply (no AI — pure TypeScript parse + write)
  // ═══════════════════════════════════════════════════════════════════════════

  // Check if response contains diffs
  const parsedDiffs = parseDiff(finalResponse);

  if (parsedDiffs.length === 0) {
    // No diffs — just a conversational reply (questions, explanations, etc.)
    output.agentReply(finalResponse);

    // Update memory — conversational turn
    const updatedMemory = updateSessionMemory(memory, intent, [], true);
    return { memory: updatedMemory };
  }

  output.phaseLabel('Phase 2: Applying changes...');
  output.diffSummary(parsedDiffs.map((d) => d.filePath));

  // Open diffs in VS Code if available
  const useVSCode = isInsideVSCodeTerminal();

  if (useVSCode) {
    const cleanups = openAllDiffsInVSCode(parsedDiffs, projectRoot);

    const confirmed = await confirmAction('Accept all changes?');

    // Cleanup temp files
    for (const cleanup of cleanups) cleanup();

    if (!confirmed) {
      output.info('Changes discarded.');
      return { memory };
    }
  } else {
    // Terminal fallback: show compact summary (diffs are already summarized above)
    // Show the raw diff portion for terminal users
    const diffSection = extractDiffSection(finalResponse);
    if (diffSection) {
      output.showDiff('changes', '', diffSection);
    }

    const confirmed = await confirmAction('Apply all changes?');
    if (!confirmed) {
      output.info('Changes discarded.');
      return { memory };
    }
  }

  // Apply changes — pure file I/O, no AI
  const written = applyParsedDiffs(parsedDiffs, projectRoot);

  output.phaseLabel('Done');
  output.info(`Applied changes to ${written.length} file(s):`);
  for (const f of written) {
    console.log(output.formatWrittenFile(f));
  }

  // Update session memory with what we did
  const updatedMemory = updateSessionMemory(memory, intent, written, false);
  return { memory: updatedMemory };
}

// ─── VS Code Integration ───────────────────────────────────────────────────

function isInsideVSCodeTerminal(): boolean {
  return !!process.env.VSCODE_IPC_HOOK_CLI || process.env.TERM_PROGRAM === 'vscode';
}

/**
 * Open VS Code diff for each changed file.
 * Returns an array of cleanup functions to remove temp files.
 */
function openAllDiffsInVSCode(
  diffs: ParsedFileDiff[],
  projectRoot: string,
): (() => void)[] {
  const cleanups: (() => void)[] = [];

  for (const diff of diffs) {
    const absolutePath = path.resolve(projectRoot, diff.filePath);
    const dir = path.dirname(absolutePath);
    const baseName = path.basename(absolutePath);
    const proposedPath = path.join(dir, `.openmerlin-proposed-${baseName}`);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // For new files, create empty original so diff works
    let createdOriginal = false;
    if (!fs.existsSync(absolutePath)) {
      fs.writeFileSync(absolutePath, '', 'utf-8');
      createdOriginal = true;
    }

    // Reconstruct the proposed file content
    const proposed = reconstructFile(diff, projectRoot);
    fs.writeFileSync(proposedPath, proposed, 'utf-8');

    try {
      execSync(`code -r --diff "${absolutePath}" "${proposedPath}"`, { stdio: 'ignore' });
      output.vscodeDiffOpened(diff.filePath);
    } catch {
      // VS Code command failed — fall through
    }

    cleanups.push(() => {
      try { fs.unlinkSync(proposedPath); } catch { /* ignore */ }
      if (createdOriginal) {
        try { fs.unlinkSync(absolutePath); } catch { /* ignore */ }
      }
    });
  }

  return cleanups;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract just the diff section from the LLM response for terminal display.
 */
function extractDiffSection(response: string): string | null {
  const match = response.match(/```diff\s*\n([\s\S]*?)```/);
  if (match) return match[1].trim();

  // Try to find raw diff blocks
  const diffStart = response.indexOf('--- ');
  if (diffStart !== -1) {
    const markerIdx = response.indexOf(DIFF_COMPLETE_MARKER, diffStart);
    if (markerIdx !== -1) {
      return response.slice(diffStart, markerIdx).trim();
    }
    return response.slice(diffStart).trim();
  }

  return null;
}

function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  const truncate = (v: unknown): string => {
    const s = String(v);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  };
  if (entries.length === 1) return truncate(entries[0][1]);
  return entries.map(([k, v]) => `${k}=${truncate(v)}`).slice(0, 3).join(', ');
}
