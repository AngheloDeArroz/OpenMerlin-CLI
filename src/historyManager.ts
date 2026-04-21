import type { LLMMessage } from './llm.js';

// ─── Session Memory (Ephemeral Context Pipeline) ────────────────────────────

/**
 * Compact cross-turn state. Instead of keeping the full message history,
 * we carry a small structured summary (~100 tokens) that tells the AI
 * what has already happened this session.
 */
export interface SessionMemory {
  turnCount: number;
  filesModified: string[];
  lastIntent: string;
  compactSummary: string;
}

/**
 * Create an empty session memory for a fresh session.
 */
export function createSessionMemory(): SessionMemory {
  return {
    turnCount: 0,
    filesModified: [],
    lastIntent: '',
    compactSummary: '',
  };
}

/**
 * Update session memory after a successful turn.
 * Keeps the summary concise by prepending the latest action.
 */
export function updateSessionMemory(
  memory: SessionMemory,
  intent: string,
  filesWritten: string[],
  wasConversational: boolean,
): SessionMemory {
  const newModified = [...new Set([...memory.filesModified, ...filesWritten])];

  // Build a running summary — latest action is appended
  let summaryLine: string;
  if (wasConversational) {
    summaryLine = `Turn ${memory.turnCount + 1}: Answered question about "${intent}"`;
  } else {
    const filesList = filesWritten.length > 0 ? ` (${filesWritten.join(', ')})` : '';
    summaryLine = `Turn ${memory.turnCount + 1}: ${intent}${filesList}`;
  }

  const prevSummary = memory.compactSummary
    ? memory.compactSummary + '\n'
    : '';

  // Cap the summary to ~500 chars (~125 tokens) — keep the most recent turns
  let newSummary = prevSummary + summaryLine;
  if (newSummary.length > 500) {
    const lines = newSummary.split('\n');
    while (newSummary.length > 500 && lines.length > 1) {
      lines.shift();
      newSummary = lines.join('\n');
    }
  }

  return {
    turnCount: memory.turnCount + 1,
    filesModified: newModified,
    lastIntent: intent,
    compactSummary: newSummary,
  };
}

// ─── Token Budget ───────────────────────────────────────────────────────────


const DEFAULT_MAX_TOKENS = 12_000;
const CHARS_PER_TOKEN = 4; // rough estimate for English + code

/**
 * Estimate token count from a string (chars / 4 approximation).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens for a message array.
 */
export function estimateHistoryTokens(messages: LLMMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // Role overhead ~4 tokens
    total += 4;
    total += estimateTokens(msg.content);
  }
  return total;
}

// ─── History Compaction ─────────────────────────────────────────────────────

/**
 * Returns a new message array with old tool-result messages compacted.
 * Keeps the last `keepRecent` tool results in full; replaces earlier ones
 * with a short summary. Does NOT mutate the input array.
 */
export function compactToolResults(
  messages: LLMMessage[],
  keepRecent: number = 2,
): LLMMessage[] {
  // Find all tool-role message indices
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') {
      toolIndices.push(i);
    }
  }

  // Only compact those beyond the recent window
  const toCompactSet = new Set(
    toolIndices.slice(0, Math.max(0, toolIndices.length - keepRecent)),
  );

  return messages.map((msg, idx) => {
    if (!toCompactSet.has(idx)) return msg;

    // Already compacted
    if (msg.content.startsWith('[Tool result:')) return msg;

    const charCount = msg.content.length;
    const lineCount = msg.content.split('\n').length;
    // Slice safely on a character boundary (avoid cutting mid-escape)
    const raw = msg.content.slice(0, 100);
    const preview = raw.replace(/\n/g, ' ').trimEnd();
    const ellipsis = charCount > 100 ? '…' : '';

    return {
      ...msg,
      content: `[Tool result: ${lineCount} lines, ${charCount} chars — "${preview}${ellipsis}"]`,
    };
  });
}

// ─── History Pruning (Sliding Window) ───────────────────────────────────────

/**
 * Prune conversation history to fit within a token budget.
 *
 * Strategy:
 * 1. Always keep the system message (index 0 if role === 'system')
 * 2. Drop user+assistant pairs from the front until we fit
 * 3. Never leave an orphaned assistant/tool message at the head
 * 4. Append a pruning note to the system message (not a fake user turn)
 */
export function pruneHistory(
  messages: LLMMessage[],
  maxTokens: number = DEFAULT_MAX_TOKENS,
): LLMMessage[] {
  const totalTokens = estimateHistoryTokens(messages);

  // Already within budget
  if (totalTokens <= maxTokens) {
    return messages;
  }

  // Split off the system message
  const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
  let rest: LLMMessage[] = systemMsg ? messages.slice(1) : [...messages];

  const systemTokens = systemMsg ? estimateTokens(systemMsg.content) + 4 : 0;
  // Reserve tokens for a possible pruning note appended to the system message
  const pruneNoteTokens = 15;
  const availableTokens = maxTokens - systemTokens - pruneNoteTokens;

  // ── Build kept list from the end, dropping whole pairs ──────────────────
  const kept: LLMMessage[] = [];
  let usedTokens = 0;

  for (let i = rest.length - 1; i >= 0; ) {
    const msgTokens = estimateTokens(rest[i].content) + 4;

    if (usedTokens + msgTokens > availableTokens) {
      // Try to drop the pair together so we don't break mid-exchange
      if (i > 0 && rest[i - 1].role !== rest[i].role) {
        i--; // skip the paired message too
      }
      break;
    }

    kept.unshift(rest[i]);
    usedTokens += msgTokens;
    i--;
  }

  // ── Ensure kept doesn't start with an orphaned assistant/tool message ───
  while (kept.length > 0 && kept[0].role !== 'user') {
    kept.shift();
  }

  const prunedCount = rest.length - kept.length;

  // ── Assemble result ──────────────────────────────────────────────────────
  const result: LLMMessage[] = [];

  if (systemMsg) {
    if (prunedCount > 0) {
      result.push({
        ...systemMsg,
        content:
          systemMsg.content +
          `\n\n[Note: ${prunedCount} earlier messages omitted for brevity.]`,
      });
    } else {
      result.push(systemMsg);
    }
  } else if (prunedCount > 0) {
    // No system message — inject a real system-role note
    result.push({
      role: 'system',
      content: `[Note: ${prunedCount} earlier messages omitted for brevity.]`,
    });
  }

  result.push(...kept);
  return result;
}

// ─── Combined helper ────────────────────────────────────────────────────────

/**
 * Compact tool results then prune to fit the token budget.
 * Call this instead of the two functions separately to ensure correct order.
 */
export function compactAndPrune(
  messages: LLMMessage[],
  maxTokens: number = DEFAULT_MAX_TOKENS,
  keepRecentTools: number = 2,
): LLMMessage[] {
  const compacted = compactToolResults(messages, keepRecentTools);
  return pruneHistory(compacted, maxTokens);
}