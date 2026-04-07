import chalk from 'chalk';
import { createPatch } from 'diff';

const GOLD   = '#4f9eff';
const TEAL   = '#7ec8ff';
const STEEL  = '#7c8fa6';
const WHITE  = '#e0e0e0';
const DIM    = '#555555';

export function thinking(): void {
  console.log(chalk.hex(DIM)('  ⠦ Thinking...'));
}

export function phaseLabel(phase: string): void {
  console.log('');
  console.log(chalk.bold.hex(GOLD)(`  ⚡ ${phase}`));
}

export function diffSummary(files: string[]): void {
  console.log(chalk.hex(STEEL)(`  ${files.length} file(s) queued for edit:`));
  for (const f of files) {
    console.log(chalk.hex(WHITE)(`    · ${f}`));
  }
}

export function toolStart(name: string): void {
  console.log(chalk.hex(STEEL)(`  ▶ ${name}`));
}

export function toolDone(name: string): void {
  console.log(chalk.hex(TEAL)(`  ✔ ${name}`));
}

export function editingFile(filePath: string): void {
  console.log(chalk.hex(GOLD)(`  ~ ${filePath}`));
}

export function showDiff(filePath: string, before: string, after: string): void {
  const patch = createPatch(filePath, before, after, 'original', 'modified');
  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(chalk.green(`  ${line}`));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(chalk.red(`  ${line}`));
    } else if (line.startsWith('@@')) {
      console.log(chalk.hex(STEEL)(`  ${line}`));
    } else {
      console.log(chalk.hex(DIM)(`  ${line}`));
    }
  }
}

export function vscodeDiffOpened(filePath: string): void {
  console.log(chalk.hex(TEAL)(`  ↗ Opened in VS Code: ${filePath}`));
}

export function agentReply(text: string): void {
  console.log('');
  console.log(chalk.hex(WHITE)(text));
  console.log('');
}

export function error(msg: string): void {
  console.log(chalk.red(`  ✖ ${msg}`));
}

export function info(msg: string): void {
  console.log(chalk.hex(STEEL)(`  · ${msg}`));
}

export function warn(msg: string): void {
  console.log(chalk.hex(GOLD)(`  ⚠ ${msg}`));
}

export function planning(): void {
  console.log(chalk.hex(GOLD)('  ⠦ Planning...'));
}

export function planStep(index: number, step: string): void {
  console.log(chalk.hex(DIM)(`    ${index + 1}.`) + ' ' + chalk.hex(WHITE)(step));
}

export function banner(cwd: string, modelInfo?: { provider: string; model: string }): void {
  const ascii = [
    '   ██████╗ ██████╗ ███████╗███╗   ██╗',
    '  ██╔═══██╗██╔══██╗██╔════╝████╗  ██║',
    '  ██║   ██║██████╔╝█████╗  ██╔██╗ ██║',
    '  ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║',
    '  ╚██████╔╝██║     ███████╗██║ ╚████║',
    '   ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝',
    '  ███╗   ███╗███████╗██████╗ ██╗     ██╗███╗   ██╗',
    '  ████╗ ████║██╔════╝██╔══██╗██║     ██║████╗  ██║',
    '  ██╔████╔██║█████╗  ██████╔╝██║     ██║██╔██╗ ██║',
    '  ██║╚██╔╝██║██╔══╝  ██╔══██╗██║     ██║██║╚██╗██║',
    '  ██║ ╚═╝ ██║███████╗██║  ██║███████╗██║██║ ╚████║',
    '  ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚═══╝',
  ];

  console.log('');
  for (const line of ascii) {
    console.log(chalk.bold.hex(GOLD)(line));
  }
  console.log('');

  const sep = chalk.hex(DIM)('  ' + '─'.repeat(50));
  console.log(sep);

  console.log(
    chalk.hex(STEEL)('  cwd    ') + chalk.hex(WHITE)(cwd),
  );
  if (modelInfo) {
    console.log(
      chalk.hex(STEEL)('  model  ') +
        chalk.hex(WHITE)(modelInfo.model) +
        chalk.hex(DIM)('  via ') +
        chalk.hex(STEEL)(modelInfo.provider),
    );
  }
  console.log(
    chalk.hex(STEEL)('  status ') + chalk.hex(TEAL)('● ready'),
  );

  console.log(sep);
  console.log('');
}

export function showActiveModel(provider: string, model: string): void {
  console.log(
    chalk.hex(TEAL)('  ● ') +
      chalk.hex(WHITE)(model) +
      chalk.hex(DIM)('  via ') +
      chalk.hex(STEEL)(provider),
  );
}

export function goodbye(): void {
  console.log('');
  console.log(chalk.hex(DIM)('  Goodbye.'));
  console.log('');
}

export function tokenEstimate(count: number): void {
  console.log(chalk.hex(DIM)(`  ~${count.toLocaleString()} tokens`));
}

export function hint(msg: string): void {
  console.log(chalk.hex(DIM)(`  💡 ${msg}`));
}

export function showHelp(): void {
  console.log('');
  console.log(chalk.bold.hex(WHITE)('  Commands'));
  console.log('');

  const cmds: [string, string][] = [
    ['--model  ', 'Change AI provider or model'],
    ['--config ', 'Open configuration menu'],
    ['--clear  ', 'Clear conversation history'],
    ['--multi  ', 'Run task with parallel worker agents'],
    ['--help   ', 'Show this help'],
    ['--exit   ', 'Exit OpenMerlin'],
  ];

  for (const [cmd, desc] of cmds) {
    console.log(
      '  ' + chalk.hex(GOLD)(cmd) + '  ' + chalk.hex(DIM)(desc),
    );
  }

  console.log('');
  console.log(chalk.hex(DIM)('  Anything else is sent as a prompt.'));
  console.log('');
}

// ─── Multi-Agent Orchestration ────────────────────────────────────────────

export function orchestratorStatus(msg: string): void {
  console.log(chalk.bold.hex(GOLD)(`  ⟳ ${msg}`));
}

export function workerStatus(id: string, msg: string): void {
  console.log(
    chalk.hex(STEEL)(`    [${id}] `) + chalk.hex(WHITE)(msg),
  );
}

export function showGroupedDiffs(grouped: Map<string, { patch: string }[]>): void {
  console.log('');
  for (const [filePath, diffs] of grouped) {
    const patch = diffs[diffs.length - 1].patch;
    const { added, removed } = countDiffLines(patch);

    const isNew = removed === 0 && added > 0;
    const label = isNew ? chalk.hex(TEAL)('new') : chalk.hex(GOLD)('mod');

    const stats = isNew
      ? chalk.green(`+${added}`)
      : `${chalk.green(`+${added}`)} ${chalk.red(`-${removed}`)}`;

    const conflict =
      diffs.length > 1 ? chalk.hex(GOLD)(` ⚠ ${diffs.length} workers`) : '';

    console.log(`  ${label}  ${chalk.hex(WHITE)(filePath)}  ${stats}${conflict}`);
  }
  console.log('');
}

export function showSingleDiff(patch: string): void {
  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(chalk.green(`    ${line}`));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(chalk.red(`    ${line}`));
    } else if (line.startsWith('@@')) {
      console.log(chalk.hex(STEEL)(`    ${line}`));
    } else {
      console.log(chalk.hex(DIM)(`    ${line}`));
    }
  }
}

function countDiffLines(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { added, removed };
}

export function tokenReport(
  usages: { agentId: string; inputTokens: number; outputTokens: number }[],
): void {
  if (usages.length === 0) return;

  console.log('');
  console.log(chalk.bold.hex(WHITE)('  Token usage'));
  console.log('');
  console.log(
    chalk.hex(DIM)('    ┌──────────────────┬──────────────┬──────────────┐'),
  );
  console.log(
    chalk.hex(DIM)('    │') +
      chalk.hex(STEEL)(' Agent             ') +
      chalk.hex(DIM)('│') +
      chalk.hex(STEEL)(' Input         ') +
      chalk.hex(DIM)('│') +
      chalk.hex(STEEL)(' Output        ') +
      chalk.hex(DIM)('│'),
  );
  console.log(
    chalk.hex(DIM)('    ├──────────────────┼──────────────┼──────────────┤'),
  );

  let totalIn = 0;
  let totalOut = 0;
  for (const u of usages) {
    totalIn += u.inputTokens;
    totalOut += u.outputTokens;
    const agent = u.agentId.padEnd(16);
    const inp   = u.inputTokens.toLocaleString().padStart(12);
    const outp  = u.outputTokens.toLocaleString().padStart(12);
    console.log(
      chalk.hex(DIM)('    │') +
        chalk.hex(WHITE)(` ${agent} `) +
        chalk.hex(DIM)('│') +
        chalk.hex(WHITE)(` ${inp} `) +
        chalk.hex(DIM)('│') +
        chalk.hex(WHITE)(` ${outp} `) +
        chalk.hex(DIM)('│'),
    );
  }

  console.log(
    chalk.hex(DIM)('    ├──────────────────┼──────────────┼──────────────┤'),
  );
  const totalAgent  = 'TOTAL'.padEnd(16);
  const totalInStr  = totalIn.toLocaleString().padStart(12);
  const totalOutStr = totalOut.toLocaleString().padStart(12);
  console.log(
    chalk.hex(DIM)('    │') +
      chalk.bold.hex(GOLD)(` ${totalAgent} `) +
      chalk.hex(DIM)('│') +
      chalk.bold.hex(GOLD)(` ${totalInStr} `) +
      chalk.hex(DIM)('│') +
      chalk.bold.hex(GOLD)(` ${totalOutStr} `) +
      chalk.hex(DIM)('│'),
  );
  console.log(
    chalk.hex(DIM)('    └──────────────────┴──────────────┴──────────────┘'),
  );
  console.log('');
}

export function formatWrittenFile(filePath: string): string {
  return chalk.hex(TEAL)(`  ✔ `) + chalk.hex(WHITE)(filePath);
}