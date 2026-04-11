import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SpartanError } from './errors/errors.js';

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

function wrapHandler(handler: ToolDefinition['handler']): ToolDefinition['handler'] {
  return async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.errors.map((e) => `- ${e.path.join('.')}: ${e.message}`).join('\n');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Validation Error:\n${message}`,
            },
          ],
          isError: true,
        };
      }

      if (error instanceof SpartanError) {
        let text = `Error (${error.code}): ${error.message}`;
        if (error.suggestion) {
          text += `\n\nSuggestion: ${error.suggestion}`;
        }
        return {
          content: [{ type: 'text' as const, text }],
          isError: true,
        };
      }

      const safeMessage =
        error instanceof Error ? error.message : 'An unexpected internal error occurred';
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unexpected error: ${safeMessage}`,
          },
        ],
        isError: true,
      };
    }
  };
}

export function registerToolGroup(server: McpServer, tools: ToolDefinition[]): void {
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, wrapHandler(tool.handler));
  }
}

export function createServer(): McpServer {
  return new McpServer({
    name: 'spartan-ng-mcp',
    version: '2.0.0',
  });
}
