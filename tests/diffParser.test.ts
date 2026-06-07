import { describe, it, expect } from 'vitest';
import { parseDiff } from '../src/diffParser.js';

function makeDiff(oldPath: string, newPath: string, hunkHeader: string, hunkBody: string): string {
  return `--- ${oldPath}\n+++ ${newPath}\n${hunkHeader}\n${hunkBody}`;
}

describe('parseDiff', () => {
  it('returns empty array for empty string', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('returns empty array for plain text with no diff', () => {
    expect(parseDiff('Just some prose text.')).toEqual([]);
  });

  it('parses a basic unified diff', () => {
    const raw = makeDiff('a/src/foo.ts', 'b/src/foo.ts', '@@ -1,3 +1,3 @@', ' unchanged\n-removed line\n+added line\n unchanged end');
    const result = parseDiff(raw);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/foo.ts');
    expect(result[0].isNewFile).toBe(false);
    expect(result[0].isDeletedFile).toBe(false);
    expect(result[0].hunks).toHaveLength(1);
  });

  it('strips a/ and b/ path prefixes', () => {
    const raw = makeDiff('a/some/file.ts', 'b/some/file.ts', '@@ -1,1 +1,1 @@', '-old\n+new');
    expect(parseDiff(raw)[0].filePath).toBe('some/file.ts');
  });

  it('detects a new file (--- /dev/null)', () => {
    const raw = makeDiff('/dev/null', 'b/src/new.ts', '@@ -0,0 +1,2 @@', '+line one\n+line two');
    const result = parseDiff(raw);
    expect(result[0].isNewFile).toBe(true);
    expect(result[0].isDeletedFile).toBe(false);
    expect(result[0].filePath).toBe('src/new.ts');
  });

  it('detects a deleted file (+++ /dev/null)', () => {
    const raw = makeDiff('a/src/old.ts', '/dev/null', '@@ -1,2 +0,0 @@', '-line one\n-line two');
    const result = parseDiff(raw);
    expect(result[0].isDeletedFile).toBe(true);
    expect(result[0].isNewFile).toBe(false);
  });

  it('parses multiple file diffs', () => {
    const raw =
      makeDiff('a/file1.ts', 'b/file1.ts', '@@ -1,1 +1,1 @@', '-old1\n+new1') +
      '\n' +
      makeDiff('a/file2.ts', 'b/file2.ts', '@@ -1,1 +1,1 @@', '-old2\n+new2');
    const result = parseDiff(raw);
    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe('file1.ts');
    expect(result[1].filePath).toBe('file2.ts');
  });

  it('parses multiple hunks in one file', () => {
    const raw =
      '--- a/src/foo.ts\n+++ b/src/foo.ts\n' +
      '@@ -1,3 +1,3 @@\n unchanged\n-old1\n+new1\n unchanged\n' +
      '@@ -10,3 +10,3 @@\n ctx\n-old2\n+new2\n ctx';
    expect(parseDiff(raw)[0].hunks).toHaveLength(2);
  });

  it('parses hunk header line numbers correctly', () => {
    const raw = makeDiff('a/f.ts', 'b/f.ts', '@@ -5,3 +5,4 @@', ' ctx\n-rm\n+add\n+extra\n ctx');
    const hunk = parseDiff(raw)[0].hunks[0];
    expect(hunk.oldStart).toBe(5);
    expect(hunk.oldCount).toBe(3);
    expect(hunk.newStart).toBe(5);
    expect(hunk.newCount).toBe(4);
  });

  it('parses hunk lines with correct prefixes', () => {
    const raw = makeDiff('a/f.ts', 'b/f.ts', '@@ -1,3 +1,3 @@', ' context\n-removed\n+added');
    const lines = parseDiff(raw)[0].hunks[0].lines;
    expect(lines).toContain(' context');
    expect(lines).toContain('-removed');
    expect(lines).toContain('+added');
  });

  it('unwraps ```diff fenced code blocks', () => {
    const raw = '```diff\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n```';
    const result = parseDiff(raw);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/foo.ts');
  });

  it('handles diffs with no count (implicit count of 1)', () => {
    const raw = '--- a/f.ts\n+++ b/f.ts\n@@ -5 +5 @@\n-old\n+new';
    const hunk = parseDiff(raw)[0].hunks[0];
    expect(hunk.oldCount).toBe(1);
    expect(hunk.newCount).toBe(1);
  });

  it('strips trailing tab timestamps from paths', () => {
    const raw = '--- a/src/foo.ts\t2025-01-01\n+++ b/src/foo.ts\t2025-01-02\n@@ -1 +1 @@\n-x\n+y';
    expect(parseDiff(raw)[0].filePath).toBe('src/foo.ts');
  });

  it('ignores blocks with no hunks', () => {
    expect(parseDiff('--- a/f.ts\n+++ b/f.ts\n')).toHaveLength(0);
  });
});
