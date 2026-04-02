import type { Config } from './config.js';
import { callLLM } from './llm.js';
import type { LLMMessage } from './llm.js';
import * as output from './output.js';
import { confirmAction } from './safety.js';

export async function generatePlan(
  task: string,
  projectContext: string,
  config: Config,
): Promise<string[] | null> {
  output.planning();

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are a planning assistant. Given a coding task and project context, generate a concise step-by-step plan.
Return ONLY a JSON array of strings, where each string is one step.
Example: ["Read the target file", "Identify functions to modify", "Add error handling to each function", "Write the updated file"]
Do not include any other text, just the JSON array.`,
    },
    {
      role: 'user',
      content: `Project Context:\n${projectContext}\n\nTask: ${task}`,
    },
  ];

  try {
    const response = await callLLM(config, messages);
    const content = response.content.trim();

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return null;
    }

    const steps = JSON.parse(jsonMatch[0]) as unknown;
    if (Array.isArray(steps) && steps.every((s) => typeof s === 'string')) {
      return steps as string[];
    }
    return null;
  } catch {
    output.warn('Could not generate plan');
    return null;
  }
}

export async function presentPlan(steps: string[]): Promise<boolean> {
  console.log('');
  output.info('Plan:');
  for (let i = 0; i < steps.length; i++) {
    output.planStep(i, steps[i]);
  }
  console.log('');

  return confirmAction('Proceed with plan?');
}
