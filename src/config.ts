import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';

export interface Config {
  apiUrl: string;
  apiKey: string;
  model: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.myagent');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'apiUrl' in parsed &&
      'apiKey' in parsed &&
      'model' in parsed
    ) {
      const cfg = parsed as Record<string, unknown>;
      if (
        typeof cfg.apiUrl === 'string' &&
        typeof cfg.apiKey === 'string' &&
        typeof cfg.model === 'string'
      ) {
        return { apiUrl: cfg.apiUrl, apiKey: cfg.apiKey, model: cfg.model };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const tempPath = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tempPath, CONFIG_PATH);

  // chmod 600 on POSIX systems
  if (process.platform !== 'win32') {
    fs.chmodSync(CONFIG_PATH, 0o600);
  }
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askMasked(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Override _writeToOutput to mask input
    const originalWrite = (rl as unknown as Record<string, unknown>)._writeToOutput as (s: string) => void;
    (rl as unknown as Record<string, unknown>)._writeToOutput = function (stringToWrite: string) {
      if (stringToWrite.includes(question)) {
        originalWrite.call(rl, stringToWrite);
      } else {
        originalWrite.call(rl, '*'.repeat(stringToWrite.length));
      }
    };

    rl.question(question, (answer) => {
      rl.close();
      // Print newline after masked input
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

export async function promptForApiKey(): Promise<Config> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n  First-time setup — configure your AI API connection.\n');
  console.log('  The API must support OpenAI-compatible chat completions format.');
  console.log('  Examples:');
  console.log('    • OpenAI:    https://api.openai.com/v1');
  console.log('    • Groq:      https://api.groq.com/openai/v1');
  console.log('    • Together:  https://api.together.xyz/v1');
  console.log('    • Ollama:    http://localhost:11434/v1');
  console.log('    • Mistral:   https://api.mistral.ai/v1');
  console.log('    • LM Studio: http://localhost:1234/v1');
  console.log('');

  let apiUrl = '';
  while (!apiUrl) {
    apiUrl = await askQuestion(rl, '  API Base URL: ');
    if (!apiUrl) {
      console.log('  API URL cannot be empty.');
    }
  }

  // Remove trailing slash
  apiUrl = apiUrl.replace(/\/+$/, '');

  rl.close();

  let apiKey = '';
  while (!apiKey) {
    apiKey = await askMasked('  API Key: ');
    if (!apiKey) {
      console.log('  API Key cannot be empty.');
    }
  }

  const rl2 = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let model = '';
  while (!model) {
    model = await askQuestion(rl2, '  Model name (e.g. gpt-4o, llama3, mistral-large): ');
    if (!model) {
      console.log('  Model name cannot be empty.');
    }
  }

  rl2.close();

  const config: Config = { apiUrl, apiKey, model };
  saveConfig(config);
  console.log('\n  Configuration saved to ~/.myagent/config.json\n');
  return config;
}
