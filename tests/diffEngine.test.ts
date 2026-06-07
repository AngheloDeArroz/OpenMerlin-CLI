import { describe, it, expect } from 'vitest';
import { generateDiff, groupDiffsByFile, isInsideVSCodeTerminal } from '../src/diffEngine.js';

// ─── generateDiff ────────────────────────────────────────────────────────────

describe('generateDiff', () => {
  it('returns a FileDiff object with correct filePath', () => {
    const diff = generateDiff('src/foo.ts', 'const a = 1;\n', 'const a = 2;\n');
    expect(diff.filePath).toBe('src/foo.ts');
  });

  it('stores original and modified content', () => {
    const original = 'line one\n';
    const modified = 'line one modified\n';
    const diff = generateDiff('f.ts', original, modified);
    expect(diff.original).toBe(original);
    expect(diff.modified).toBe(modified);
  });

  it('produces a non-empty patch for changed content', () => {
    const diff = generateDiff('f.ts', 'old\n', 'new\n');
    expect(diff.patch.length).toBeGreaterThan(0);
  });

  it('patch contains --- and +++ headers', () => {
    const diff = generateDiff('src/foo.ts', 'old\n', 'new\n');
    expect(diff.patch).toContain('---');
    expect(diff.patch).toContain('+++');
  });

  it('patch contains removed line with - prefix', () => {
    const diff = generateDiff('f.ts', 'old\n', 'new\n');
    expect(diff.patch).toContain('-old');
  });

  it('patch contains added line with + prefix', () => {
    const diff = generateDiff('f.ts', 'old\n', 'new\n');
    expect(diff.patch).toContain('+new');
  });

  it('produces empty patch (no hunks) when content is identical', () => {
    const content = 'same content\n';
    const diff = generateDiff('f.ts', content, content);
    // When content is identical createPatch still returns headers but no @@ hunks
    expect(diff.patch).not.toContain('@@');
  });

  it('handles empty original (new file scenario)', () => {
    const diff = generateDiff('new.ts', '', 'export const x = 1;\n');
    expect(diff.patch).toContain('+export const x = 1;');
  });

  it('handles empty modified (deletion scenario)', () => {
    const diff = generateDiff('old.ts', 'const x = 1;\n', '');
    expect(diff.patch).toContain('-const x = 1;');
  });
});

// ─── groupDiffsByFile ────────────────────────────────────────────────────────

describe('groupDiffsByFile', () => {
  it('returns an empty map for empty input', () => {
    expect(groupDiffsByFile([])).toEqual(new Map());
  });

  it('groups a single diff under its filePath key', () => {
    const diff = generateDiff('src/a.ts', 'old\n', 'new\n');
    const map = groupDiffsByFile([diff]);
    expect(map.has('src/a.ts')).toBe(true);
    expect(map.get('src/a.ts')).toHaveLength(1);
  });

  it('groups multiple diffs for the same file together', () => {
    const d1 = generateDiff('src/a.ts', 'v1\n', 'v2\n');
    const d2 = generateDiff('src/a.ts', 'v2\n', 'v3\n');
    const map = groupDiffsByFile([d1, d2]);
    expect(map.get('src/a.ts')).toHaveLength(2);
  });

  it('keeps different files in separate keys', () => {
    const da = generateDiff('src/a.ts', 'a\n', 'a2\n');
    const db = generateDiff('src/b.ts', 'b\n', 'b2\n');
    const map = groupDiffsByFile([da, db]);
    expect(map.size).toBe(2);
    expect(map.has('src/a.ts')).toBe(true);
    expect(map.has('src/b.ts')).toBe(true);
  });

  it('preserves the order of diffs within a group', () => {
    const d1 = generateDiff('src/a.ts', 'old\n', 'mid\n');
    const d2 = generateDiff('src/a.ts', 'mid\n', 'new\n');
    const group = groupDiffsByFile([d1, d2]).get('src/a.ts')!;
    expect(group[0]).toBe(d1);
    expect(group[1]).toBe(d2);
  });
});

// ─── isInsideVSCodeTerminal ──────────────────────────────────────────────────

describe('isInsideVSCodeTerminal', () => {
  it('returns a boolean', () => {
    expect(typeof isInsideVSCodeTerminal()).toBe('boolean');
  });

  it('returns true when VSCODE_IPC_HOOK_CLI is set', () => {
    const orig = process.env.VSCODE_IPC_HOOK_CLI;
    process.env.VSCODE_IPC_HOOK_CLI = '/tmp/hook';
    expect(isInsideVSCodeTerminal()).toBe(true);
    if (orig === undefined) delete process.env.VSCODE_IPC_HOOK_CLI;
    else process.env.VSCODE_IPC_HOOK_CLI = orig;
  });

  it('returns true when TERM_PROGRAM is vscode', () => {
    const origHook = process.env.VSCODE_IPC_HOOK_CLI;
    const origTerm = process.env.TERM_PROGRAM;
    delete process.env.VSCODE_IPC_HOOK_CLI;
    process.env.TERM_PROGRAM = 'vscode';
    expect(isInsideVSCodeTerminal()).toBe(true);
    if (origHook === undefined) delete process.env.VSCODE_IPC_HOOK_CLI;
    else process.env.VSCODE_IPC_HOOK_CLI = origHook;
    if (origTerm === undefined) delete process.env.TERM_PROGRAM;
    else process.env.TERM_PROGRAM = origTerm;
  });

  it('returns false when neither env var is set', () => {
    const origHook = process.env.VSCODE_IPC_HOOK_CLI;
    const origTerm = process.env.TERM_PROGRAM;
    delete process.env.VSCODE_IPC_HOOK_CLI;
    delete process.env.TERM_PROGRAM;
    expect(isInsideVSCodeTerminal()).toBe(false);
    if (origHook !== undefined) process.env.VSCODE_IPC_HOOK_CLI = origHook;
    if (origTerm !== undefined) process.env.TERM_PROGRAM = origTerm;
  });
});
