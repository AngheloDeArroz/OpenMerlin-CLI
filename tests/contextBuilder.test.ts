import { describe, it, expect } from 'vitest';
import { readRelevantFiles, listProjectFiles } from '../src/contextBuilder.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'openmerlin-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── readRelevantFiles ────────────────────────────────────────────────────────

describe('readRelevantFiles', () => {
  it('returns empty string for an empty file list', () => {
    const result = readRelevantFiles([], '/any/root');
    expect(result).toBe('');
  });

  it('reads a file that exists and wraps it in a code block', () => {
    const dir = makeTempDir();
    try {
      const filePath = path.join(dir, 'hello.ts');
      fs.writeFileSync(filePath, 'export const x = 1;', 'utf-8');
      const result = readRelevantFiles(['hello.ts'], dir);
      expect(result).toContain('### hello.ts');
      expect(result).toContain('export const x = 1;');
    } finally {
      cleanup(dir);
    }
  });

  it('shows "(file not found)" for missing files', () => {
    const dir = makeTempDir();
    try {
      const result = readRelevantFiles(['nonexistent.ts'], dir);
      expect(result).toContain('(file not found)');
    } finally {
      cleanup(dir);
    }
  });

  it('handles multiple files', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, 'a.ts'), 'const a = 1;', 'utf-8');
      fs.writeFileSync(path.join(dir, 'b.ts'), 'const b = 2;', 'utf-8');
      const result = readRelevantFiles(['a.ts', 'b.ts'], dir);
      expect(result).toContain('### a.ts');
      expect(result).toContain('### b.ts');
    } finally {
      cleanup(dir);
    }
  });

  it('truncates files exceeding MAX_CHARS_PER_FILE', () => {
    const dir = makeTempDir();
    try {
      // Write > 8000 chars
      fs.writeFileSync(path.join(dir, 'big.ts'), 'x'.repeat(9000), 'utf-8');
      const result = readRelevantFiles(['big.ts'], dir);
      expect(result).toContain('truncated');
    } finally {
      cleanup(dir);
    }
  });

  it('skips files outside the project root (path traversal)', () => {
    const dir = makeTempDir();
    try {
      // Attempt to read a file outside the project root via traversal
      const result = readRelevantFiles(['../../etc/passwd'], dir);
      // Should not include the real passwd content; treated as not found or skipped
      expect(result).not.toContain('root:x:');
    } finally {
      cleanup(dir);
    }
  });
});

// ─── listProjectFiles ─────────────────────────────────────────────────────────

describe('listProjectFiles', () => {
  it('returns an array', () => {
    const dir = makeTempDir();
    try {
      expect(Array.isArray(listProjectFiles(dir))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('returns empty array for an empty directory', () => {
    const dir = makeTempDir();
    try {
      expect(listProjectFiles(dir)).toHaveLength(0);
    } finally {
      cleanup(dir);
    }
  });

  it('lists files in the root directory', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, 'index.ts'), '', 'utf-8');
      const files = listProjectFiles(dir);
      expect(files).toContain('index.ts');
    } finally {
      cleanup(dir);
    }
  });

  it('lists files in subdirectories', () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(path.join(dir, 'src', 'app.ts'), '', 'utf-8');
      const files = listProjectFiles(dir);
      expect(files.some((f) => f.includes('app.ts'))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('ignores node_modules directory', () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, 'node_modules'));
      fs.writeFileSync(path.join(dir, 'node_modules', 'lib.js'), '', 'utf-8');
      const files = listProjectFiles(dir);
      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  it('ignores .git directory', () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, '.git'));
      fs.writeFileSync(path.join(dir, '.git', 'HEAD'), '', 'utf-8');
      const files = listProjectFiles(dir);
      expect(files.some((f) => f.includes('.git'))).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  it('ignores dist directory', () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, 'dist'));
      fs.writeFileSync(path.join(dir, 'dist', 'index.js'), '', 'utf-8');
      const files = listProjectFiles(dir);
      expect(files.some((f) => f.includes('dist'))).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  it('uses forward slashes in returned paths', () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(path.join(dir, 'src', 'foo.ts'), '', 'utf-8');
      const files = listProjectFiles(dir);
      const srcFile = files.find((f) => f.includes('foo.ts'));
      expect(srcFile).toBeDefined();
      expect(srcFile).not.toContain('\\');
    } finally {
      cleanup(dir);
    }
  });

  it('respects maxDepth limit', () => {
    const dir = makeTempDir();
    try {
      // Create a 3-level deep file
      fs.mkdirSync(path.join(dir, 'a', 'b', 'c'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'a', 'b', 'c', 'deep.ts'), '', 'utf-8');
      // maxDepth=1 should not reach a/b/c
      const files = listProjectFiles(dir, 1);
      expect(files.some((f) => f.includes('deep.ts'))).toBe(false);
    } finally {
      cleanup(dir);
    }
  });
});
