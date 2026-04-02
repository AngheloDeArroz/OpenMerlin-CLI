#!/usr/bin/env node

import * as readline from 'node:readline';
import { loadConfig, promptForApiKey } from './config.js';
import type { Config } from './config.js';
import { scanProject, formatProjectContext } from './scanner.js';
import { runAgent } from './agent.js';
import type { LLMMessage } from './llm.js';
import * as output from './output.js';

async function main(): Promise<void> {
  const cwd = process.cwd();

  output.banner(cwd);

  // Load or prompt for config
  let config: Config | null = loadConfig();
  if (!config) {
    config = await promptForApiKey();
  }

  // Scan project
  output.info('Scanning project...');
  const projectSummary = scanProject(cwd);
  const projectContext = formatProjectContext(projectSummary);
  output.info('Project scanned. Ready.\n');

  // Message history persists across the session
  const history: LLMMessage[] = [];

  // Start readline loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question('> ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        output.goodbye();
        rl.close();
        process.exit(0);
      }

      if (trimmed.toLowerCase() === 'clear') {
        history.length = 0;
        output.info('Conversation history cleared.');
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'config') {
        config = await promptForApiKey();
        output.info('Configuration updated.');
        prompt();
        return;
      }

      try {
        await runAgent(trimmed, history, config as Config, projectContext, cwd);
      } catch (err) {
        output.error(err instanceof Error ? err.message : String(err));
      }

      prompt();
    });
  };

  prompt();

  // Handle SIGINT gracefully
  process.on('SIGINT', () => {
    console.log('');
    output.goodbye();
    rl.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
