import * as fs from 'node:fs';
import * as path from 'node:path';

interface ProjectSummary {
  fileTree: string;
  packageJson?: Record<string, unknown>;
  readme?: string;
}

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv', 'coverage']);
const MAX_DEPTH = 3;

function buildTree(dir: string, prefix: string, depth: number): string[] {
  if (depth > MAX_DEPTH) return [];

  const lines: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return lines;
  }

  // Sort: directories first, then files
  const sorted = entries
    .filter((e) => !e.name.startsWith('.') || e.name === '.env.example')
    .filter((e) => !IGNORE_DIRS.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (entry.isDirectory()) {
      lines.push(`${prefix}${connector}${entry.name}/`);
      const children = buildTree(
        path.join(dir, entry.name),
        prefix + childPrefix,
        depth + 1,
      );
      lines.push(...children);
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }

  return lines;
}

export function scanProject(dir: string): ProjectSummary {
  const treeLines = buildTree(dir, '', 0);
  const fileTree = treeLines.join('\n');

  let packageJson: Record<string, unknown> | undefined;
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // ignore parse errors
    }
  }

  let readme: string | undefined;
  const readmePath = path.join(dir, 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      const content = fs.readFileSync(readmePath, 'utf-8');
      // Truncate to first 2000 chars to keep prompt small
      readme = content.length > 500 ? content.slice(0, 500) + '\n...(truncated)' : content;
    } catch {
      // ignore read errors
    }
  }

  return { fileTree, packageJson, readme };
}

export function formatProjectContext(summary: ProjectSummary): string {
  let context = '## Project Structure\n```\n' + summary.fileTree + '\n```\n';

  if (summary.packageJson) {
    const pkg = summary.packageJson;
    context += '\n## package.json (summary)\n';
    if (pkg.name) context += `- Name: ${pkg.name as string}\n`;
    if (pkg.description) context += `- Description: ${pkg.description as string}\n`;
    if (pkg.dependencies) {
      context += `- Dependencies: ${Object.keys(pkg.dependencies as Record<string, string>).join(', ')}\n`;
    }
    if (pkg.devDependencies) {
      context += `- DevDependencies: ${Object.keys(pkg.devDependencies as Record<string, string>).join(', ')}\n`;
    }
    if (pkg.scripts) {
      context += `- Scripts: ${Object.keys(pkg.scripts as Record<string, string>).join(', ')}\n`;
    }
  }

  if (summary.readme) {
    context += '\n## README.md\n' + summary.readme + '\n';
  }

  return context;
}
