import { describe, it, expect } from 'vitest';
import {
  createSessionMemory,
  updateSessionMemory,
  estimateTokens,
  estimateHistoryTokens,
  compactToolResults,
  pruneHistory,
  compactAndPrune,
} from '../src/historyManager.js';
import type { SessionMemory } from '../src/historyManager.js';
import type { LLMMessage } from '../src/llm.js';

// ─── createSessionMemory ──────────────────────────────────────────────────────

describe('createSessionMemory', () => {
  it('returns zero turnCount', () => {
    expect(createSessionMemory().turnCount).toBe(0);
  });

  it('returns empty filesModified array', () => {
    expect(createSessionMemory().filesModified).toEqual([]);
  });

  it('returns empty lastIntent', () => {
    expect(createSessionMemory().lastIntent).toBe('');
  });

  it('returns empty compactSummary', () => {
    expect(createSessionMemory().compactSummary).toBe('');
  });
});

// ─── updateSessionMemory ──────────────────────────────────────────────────────

describe('updateSessionMemory', () => {
  it('increments turnCount by 1', () => {
    const mem = createSessionMemory();
    const updated = updateSessionMemory(mem, 'add feature', ['src/a.ts'], false);
    expect(updated.turnCount).toBe(1);
  });

  it('sets lastIntent from intent param', () => {
    const updated = updateSessionMemory(createSessionMemory(), 'refactor code', [], false);
    expect(updated.lastIntent).toBe('refactor code');
  });

  it('accumulates filesModified across turns', () => {
    let mem = createSessionMemory();
    mem = updateSessionMemory(mem, 'turn 1', ['src/a.ts'], false);
    mem = updateSessionMemory(mem, 'turn 2', ['src/b.ts'], false);
    expect(mem.filesModified).toContain('src/a.ts');
    expect(mem.filesModified).toContain('src/b.ts');
  });

  it('deduplicates filesModified', () => {
    let mem = createSessionMemory();
    mem = updateSessionMemory(mem, 't1', ['src/a.ts'], false);
    mem = updateSessionMemory(mem, 't2', ['src/a.ts'], false);
    expect(mem.filesModified.filter((f) => f === 'src/a.ts')).toHaveLength(1);
  });

  it('adds a conversational entry when wasConversational=true', () => {
    const mem = updateSessionMemory(createSessionMemory(), 'what is X', [], true);
    expect(mem.compactSummary).toContain('Answered question');
  });

  it('adds a code change entry when wasConversational=false', () => {
    const mem = updateSessionMemory(createSessionMemory(), 'refactor module', ['src/a.ts'], false);
    expect(mem.compactSummary).toContain('refactor module');
    expect(mem.compactSummary).toContain('src/a.ts');
  });

  it('caps compactSummary at ~500 chars', () => {
    let mem = createSessionMemory();
    for (let i = 0; i < 20; i++) {
      mem = updateSessionMemory(mem, `very long intent description number ${i}`, [], false);
    }
    expect(mem.compactSummary.length).toBeLessThanOrEqual(520); // slight buffer for last append
  });
});

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns a positive number for non-empty text', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
  });

  it('estimates ~4 chars per token', () => {
    // 40 chars → ~10 tokens
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });

  it('rounds up (ceiling)', () => {
    // 5 chars → ceil(5/4) = 2
    expect(estimateTokens('abcde')).toBe(2);
  });
});

// ─── estimateHistoryTokens ───────────────────────────────────────────────────

describe('estimateHistoryTokens', () => {
  it('returns 0 for empty message array', () => {
    expect(estimateHistoryTokens([])).toBe(0);
  });

  it('adds 4 overhead tokens per message', () => {
    const msgs: LLMMessage[] = [{ role: 'user', content: '' }];
    // empty content → 0 tokens + 4 overhead
    expect(estimateHistoryTokens(msgs)).toBe(4);
  });

  it('sums tokens across multiple messages', () => {
    const msgs: LLMMessage[] = [
      { role: 'user', content: 'a'.repeat(40) },      // 10 tokens + 4
      { role: 'assistant', content: 'b'.repeat(40) }, // 10 tokens + 4
    ];
    expect(estimateHistoryTokens(msgs)).toBe(28);
  });
});

// ─── compactToolResults ──────────────────────────────────────────────────────

describe('compactToolResults', () => {
  it('does nothing when there are no tool messages', () => {
    const msgs: LLMMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    expect(compactToolResults(msgs)).toEqual(msgs);
  });

  it('keeps the most recent tool messages in full', () => {
    const msgs: LLMMessage[] = [
      { role: 'tool', content: 'result 1' },
      { role: 'tool', content: 'result 2' },
    ];
    // keepRecent=2 → both are kept in full
    const result = compactToolResults(msgs, 2);
    expect(result[0].content).toBe('result 1');
    expect(result[1].content).toBe('result 2');
  });

  it('compacts older tool messages beyond keepRecent', () => {
    const msgs: LLMMessage[] = [
      { role: 'tool', content: 'old result that should be compacted' },
      { role: 'tool', content: 'recent result 1' },
      { role: 'tool', content: 'recent result 2' },
    ];
    const result = compactToolResults(msgs, 2);
    // First message (index 0) should be compacted
    expect(result[0].content).toMatch(/^\[Tool result:/);
    // Last two should be untouched
    expect(result[1].content).toBe('recent result 1');
    expect(result[2].content).toBe('recent result 2');
  });

  it('does not mutate original array', () => {
    const msgs: LLMMessage[] = [{ role: 'tool', content: 'original' }];
    compactToolResults(msgs, 0);
    expect(msgs[0].content).toBe('original');
  });
});

// ─── pruneHistory ────────────────────────────────────────────────────────────

describe('pruneHistory', () => {
  it('returns messages unchanged when under token budget', () => {
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
    ];
    const result = pruneHistory(msgs, 12_000);
    expect(result).toHaveLength(2);
  });

  it('always keeps the system message', () => {
    // Create many large messages to force pruning
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'sys prompt' },
      ...Array.from({ length: 50 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: 'x'.repeat(200),
      })),
    ];
    const result = pruneHistory(msgs, 500);
    expect(result[0].role).toBe('system');
  });

  it('injects pruning note into system message when messages are dropped', () => {
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'x'.repeat(2000) },
      { role: 'assistant', content: 'x'.repeat(2000) },
      { role: 'user', content: 'latest question' },
    ];
    const result = pruneHistory(msgs, 500);
    const sysContent = result[0].content;
    expect(sysContent).toContain('earlier messages omitted');
  });

  it('pruned result never starts with an orphaned assistant message', () => {
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'x'.repeat(300) },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'follow-up' },
    ];
    const result = pruneHistory(msgs, 200);
    const nonSystem = result.filter((m) => m.role !== 'system');
    if (nonSystem.length > 0) {
      expect(nonSystem[0].role).toBe('user');
    }
  });
});

// ─── compactAndPrune ─────────────────────────────────────────────────────────

describe('compactAndPrune', () => {
  it('returns an array', () => {
    expect(Array.isArray(compactAndPrune([]))).toBe(true);
  });

  it('applies both compaction and pruning', () => {
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'tool', content: 'old tool result with lots of text to ensure compaction occurs here' },
      { role: 'tool', content: 'recent tool result' },
      { role: 'user', content: 'latest' },
    ];
    const result = compactAndPrune(msgs, 12_000, 1);
    // The first tool result should be compacted
    const toolMsgs = result.filter((m) => m.role === 'tool');
    if (toolMsgs.length > 0) {
      expect(toolMsgs[0].content).toMatch(/^\[Tool result:/);
    }
  });
});
