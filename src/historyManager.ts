import type { LLMMessage } from './llm.js';

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
 * Compact old tool-result messages in place. Keeps the last `keepRecent`
 * tool results in full; replaces earlier ones with a short summary.
 */
export function compactToolResults(
  messages: LLMMessage[],
  keepRecent: number = 2,
): void {
  // Find all tool-role message indices
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') {
      toolIndices.push(i);
    }
  }

  // Only compact those beyond the recent window
  const toCompact = toolIndices.slice(0, Math.max(0, toolIndices.length - keepRecent));

  for (const idx of toCompact) {
    const msg = messages[idx];
    // Already compacted
    if (msg.content.startsWith('[Tool result:')) continue;

    const charCount = msg.content.length;
    const lineCount = msg.content.split('\n').length;

    // Create a compact summary
    const preview = msg.content.slice(0, 100).replace(/\n/g, ' ').trim();
    msg.content = `[Tool result: ${lineCount} lines, ${charCount} chars — "${preview}${charCount > 100 ? '…' : ''}"]`;
  }
}

// ─── History Pruning (Sliding Window) ───────────────────────────────────────

/**
 * Prune conversation history to fit within a token budget.
 * Strategy:
 * 1. Always keep the system message (index 0)
 * 2. Keep the most recent messages that fit within the budget
 * 3. If pruned, inject a note so the LLM knows context was trimmed
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

  // System message is always kept
  const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
  const rest = systemMsg ? messages.slice(1) : [...messages];

  const systemTokens = systemMsg ? estimateTokens(systemMsg.content) + 4 : 0;
  const availableTokens = maxTokens - systemTokens - 30; // 30 tokens for the pruning note

  // Build from the end, keeping recent messages that fit
  const kept: LLMMessage[] = [];
  let usedTokens = 0;

  for (let i = rest.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(rest[i].content) + 4;
    if (usedTokens + msgTokens > availableTokens) {
      break;
    }
    kept.unshift(rest[i]);
    usedTokens += msgTokens;
  }

  const prunedCount = rest.length - kept.length;

  const result: LLMMessage[] = [];

  if (systemMsg) {
    result.push(systemMsg);
  }

  if (prunedCount > 0) {
    result.push({
      role: 'user',
      content: `[Note: ${prunedCount} earlier messages were pruned to save tokens. Continue the conversation based on the remaining context.]`,
    });
  }

  result.push(...kept);
  return result;
}
