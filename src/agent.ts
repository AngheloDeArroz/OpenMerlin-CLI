import type { Config } from './config.js';
import { callLLM, LLMError } from './llm.js';
import type { LLMMessage, ToolCall } from './llm.js';
import { getToolDefinitions, executeTool } from './tools/index.js';
import { generatePlan, presentPlan } from './planner.js';
import * as output from './output.js';

const MAX_TOOL_ITERATIONS = 20;

function buildSystemPrompt(projectContext: string): string {
  const toolDefs = getToolDefinitions();
  const toolDescriptions = toolDefs
    .map((t) => `- **${t.name}**: ${t.description}`)
    .join('\n');

  return `You are OpenMerlin-CLI, an expert coding assistant running in the user's terminal.

## Available Tools
${toolDescriptions}

## Project Context
${projectContext}

## Instructions
- Think step by step before making changes
- For complex tasks (multi-file edits, new features, refactors), create a plan first
- Always read relevant files before editing them
- When writing files, provide the COMPLETE file content — never use placeholders or ellipsis
- Use search_code to understand the codebase before making changes
- Explain what you're doing and why at each step
- Be concise but thorough in your responses

## Safety Rules
- Never modify files outside the project directory
- Always confirm with the user before writing files or running commands
- Never expose API keys, secrets, or credentials in your responses
- If unsure about a destructive action, ask the user first`;
}

export async function runAgent(
  userInput: string,
  history: LLMMessage[],
  config: Config,
  projectContext: string,
  projectRoot: string,
): Promise<void> {
  // Build system prompt if first message
  if (history.length === 0) {
    history.push({
      role: 'system',
      content: buildSystemPrompt(projectContext),
    });
  }

  // Append user message
  history.push({ role: 'user', content: userInput });

  output.thinking();

  // Detect complex tasks and generate a plan
  const complexKeywords = [
    'refactor', 'restructure', 'migrate', 'convert', 'implement',
    'add feature', 'new feature', 'create', 'build', 'redesign',
    'all files', 'all functions', 'entire', 'across',
  ];
  const isComplex = complexKeywords.some((kw) =>
    userInput.toLowerCase().includes(kw),
  );

  if (isComplex) {
    const plan = await generatePlan(userInput, projectContext, config);
    if (plan && plan.length > 0) {
      const proceed = await presentPlan(plan);
      if (!proceed) {
        output.info('Plan cancelled.');
        // Remove the user message we just added
        history.pop();
        return;
      }
      // Inject plan into the conversation
      history.push({
        role: 'user',
        content: `The user approved this plan. Execute it step by step:\n${plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      });
    }
  }

  const toolDefs = getToolDefinitions();
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    let response;
    try {
      response = await callLLM(config, history, toolDefs);
    } catch (err) {
      if (err instanceof LLMError) {
        output.error(`LLM API error: ${err.message}`);
      } else {
        output.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    // If there are tool calls, execute them
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Append assistant message with tool calls to history
      // We need to include the tool_calls in the message for the API
      const assistantMsg: LLMMessage & { tool_calls?: ToolCall[] } = {
        role: 'assistant',
        content: response.content || '',
      };

      // Store tool calls info for the API
      history.push({
        role: 'assistant',
        content: response.content || '',
      });

      // Patch the last message to include tool_calls for API compatibility
      const lastMsg = history[history.length - 1] as LLMMessage & { tool_calls?: object[] };
      lastMsg.tool_calls = response.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        output.toolStart(`${toolCall.name} → ${formatToolArgs(toolCall.arguments)}`);

        const result = await executeTool(toolCall.name, toolCall.arguments, projectRoot);

        if (result.success) {
          output.toolDone(toolCall.name);
        } else {
          output.error(result.error || 'Tool execution failed');
        }

        // Append tool result to history
        history.push({
          role: 'tool',
          content: result.success
            ? result.output
            : `Error: ${result.error || 'Unknown error'}`,
          tool_call_id: toolCall.id,
        });
      }

      // Continue the loop — call LLM again with tool results
      continue;
    }

    // No tool calls — final response
    if (response.content) {
      history.push({ role: 'assistant', content: response.content });
      output.agentReply(response.content);
    }
    break;
  }

  if (iterations >= MAX_TOOL_ITERATIONS) {
    output.warn(`Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}). Stopping.`);
  }
}

function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  if (entries.length === 1) return String(entries[0][1]);
  return entries.map(([k, v]) => `${k}=${String(v)}`).slice(0, 3).join(', ');
}
