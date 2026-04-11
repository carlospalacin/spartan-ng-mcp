import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SpartanError, SpartanErrorCode } from './errors/errors.js';
import { createServer, registerToolGroup, type ToolDefinition } from './server.js';

// Helper to access the wrapped handler — registers tool and extracts the callback
function extractWrappedHandler(handler: ToolDefinition['handler']): ToolDefinition['handler'] {
  const server = createServer();
  let captured: ToolDefinition['handler'] | undefined;
  const originalTool = server.tool.bind(server);

  server.tool = ((...args: unknown[]) => {
    // The 4th argument is the wrapped handler
    captured = args[3] as ToolDefinition['handler'];
    return originalTool(...(args as Parameters<typeof server.tool>));
  }) as typeof server.tool;

  registerToolGroup(server, [
    {
      name: 'test',
      title: 'Test',
      description: 'Test',
      inputSchema: {},
      handler,
    },
  ]);

  return captured!;
}

describe('createServer', () => {
  it('creates McpServer instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});

describe('registerToolGroup', () => {
  it('registers tools on the server', () => {
    const server = createServer();
    const tools: ToolDefinition[] = [
      {
        name: 'test_tool',
        title: 'Test Tool',
        description: 'A test tool',
        inputSchema: { name: z.string() },
        handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      },
    ];
    registerToolGroup(server, tools);
  });

  it('passes through successful responses', async () => {
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: 'text' as const, text: 'success' }],
    });
    const wrapped = extractWrappedHandler(handler);
    const result = await wrapped({});
    expect(result.content[0].text).toBe('success');
  });

  it('wraps SpartanError with code and suggestion', async () => {
    const handler = vi.fn().mockRejectedValue(
      new SpartanError('not found', {
        code: SpartanErrorCode.COMPONENT_NOT_FOUND,
        suggestion: 'use spartan_list',
      }),
    );
    const wrapped = extractWrappedHandler(handler);
    const result = await wrapped({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('COMPONENT_NOT_FOUND');
    expect(result.content[0].text).toContain('not found');
    expect(result.content[0].text).toContain('use spartan_list');
  });

  it('wraps SpartanError without suggestion', async () => {
    const handler = vi.fn().mockRejectedValue(
      new SpartanError('error', { code: SpartanErrorCode.NETWORK_ERROR }),
    );
    const wrapped = extractWrappedHandler(handler);
    const result = await wrapped({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('NETWORK_ERROR');
    expect(result.content[0].text).not.toContain('Suggestion');
  });

  it('wraps ZodError with field details', async () => {
    const handler = vi.fn().mockImplementation(async () => {
      z.object({ name: z.string() }).parse({});
    });
    const wrapped = extractWrappedHandler(handler);
    const result = await wrapped({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation Error');
    expect(result.content[0].text).toContain('name');
  });

  it('wraps generic Error with safe message', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('something broke'));
    const wrapped = extractWrappedHandler(handler);
    const result = await wrapped({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('something broke');
  });

  it('wraps non-Error throws with generic message', async () => {
    const handler = vi.fn().mockRejectedValue('string error');
    const wrapped = extractWrappedHandler(handler);
    const result = await wrapped({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unexpected internal error');
  });
});
