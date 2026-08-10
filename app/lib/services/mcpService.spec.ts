import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ------------------------------------------------------------------ *
 * Module mocks — hoisted by vitest before imports are resolved.
 * ------------------------------------------------------------------ */

vi.mock('ai', () => ({
  experimental_createMCPClient: vi.fn(),
  convertToCoreMessages: vi.fn((messages: any) => messages),
  formatDataStreamPart: vi.fn((type: string, data: any) => `data: ${JSON.stringify({ type, data })}\n`),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

vi.mock('ai/mcp-stdio', () => ({
  Experimental_StdioMCPTransport: vi.fn(),
}));

import { MCPService } from './mcpService';
import {
  stdioServerConfigSchema,
  sseServerConfigSchema,
  streamableHTTPServerConfigSchema,
  mcpServerConfigSchema,
  mcpConfigSchema,
} from './mcpService';
import { experimental_createMCPClient } from 'ai';
import {
  TOOL_EXECUTION_APPROVAL,
  TOOL_EXECUTION_DENIED,
  TOOL_EXECUTION_ERROR,
  TOOL_NO_EXECUTE_FUNCTION,
} from '~/utils/constants';

/* ------------------------------------------------------------------ *
 * Helper: create a mock MCP client.
 * ------------------------------------------------------------------ */
function createMockClient(tools: Record<string, any> = {}) {
  const client = {
    tools: vi.fn(async () => tools),
    close: vi.fn(async () => { /* no-op */ }),
  };
  return Object.assign(client, { serverName: '' });
}

/* ------------------------------------------------------------------ *
 * Helper: create a mock DataStreamWriter for processToolCall.
 * ------------------------------------------------------------------ */
function createMockDataStream() {
  return {
    writeMessageAnnotation: vi.fn(),
    write: vi.fn(),
  };
}

describe('MCPService — Zod schemas', () => {
  describe('stdioServerConfigSchema', () => {
    it('should validate a minimal stdio config', () => {
      const result = stdioServerConfigSchema.parse({ command: 'echo' });
      expect(result.type).toBe('stdio');
      expect(result.command).toBe('echo');
    });

    it('should validate a full stdio config', () => {
      const result = stdioServerConfigSchema.parse({
        command: 'npx',
        args: ['--yes', 'server'],
        cwd: '/tmp',
        env: { FOO: 'bar' },
      });
      expect(result.type).toBe('stdio');
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['--yes', 'server']);
      expect(result.cwd).toBe('/tmp');
      expect(result.env).toEqual({ FOO: 'bar' });
    });

    it('should reject config without command', () => {
      expect(() => stdioServerConfigSchema.parse({})).toThrow();
    });

    it('should reject config with empty command', () => {
      expect(() => stdioServerConfigSchema.parse({ command: '' })).toThrow();
    });
  });

  describe('sseServerConfigSchema', () => {
    it('should validate a minimal SSE config', () => {
      const result = sseServerConfigSchema.parse({ url: 'http://localhost:3000/sse' });
      expect(result.type).toBe('sse');
      expect(result.url).toBe('http://localhost:3000/sse');
    });

    it('should validate an SSE config with headers', () => {
      const result = sseServerConfigSchema.parse({
        url: 'http://localhost:3000/sse',
        headers: { Authorization: 'Bearer token' },
      });
      expect(result.headers).toEqual({ Authorization: 'Bearer token' });
    });

    it('should reject config without url', () => {
      expect(() => sseServerConfigSchema.parse({})).toThrow();
    });

    it('should reject config with invalid url', () => {
      expect(() => sseServerConfigSchema.parse({ url: 'not-a-url' })).toThrow();
    });
  });

  describe('streamableHTTPServerConfigSchema', () => {
    it('should validate a minimal streamable-http config', () => {
      const result = streamableHTTPServerConfigSchema.parse({ url: 'http://localhost:3000/mcp' });
      expect(result.type).toBe('streamable-http');
      expect(result.url).toBe('http://localhost:3000/mcp');
    });

    it('should reject config without url', () => {
      expect(() => streamableHTTPServerConfigSchema.parse({})).toThrow();
    });

    it('should reject config with invalid url', () => {
      // Zod's .url() accepts any valid URL scheme (including ftp://), so use a
      // truly invalid URL string that fails the format check.
      expect(() => streamableHTTPServerConfigSchema.parse({ url: 'not-a-url' })).toThrow();
    });
  });

  describe('mcpServerConfigSchema (union)', () => {
    it('should parse a stdio config', () => {
      const result = mcpServerConfigSchema.parse({ command: 'echo' });
      expect(result.type).toBe('stdio');
    });

    it('should parse an SSE config', () => {
      const result = mcpServerConfigSchema.parse({ type: 'sse', url: 'http://localhost:3000' });
      expect(result.type).toBe('sse');
    });

    it('should parse a streamable-http config', () => {
      const result = mcpServerConfigSchema.parse({
        type: 'streamable-http',
        url: 'http://localhost:3000',
      });
      expect(result.type).toBe('streamable-http');
    });

    it('should reject an invalid config', () => {
      expect(() => mcpServerConfigSchema.parse({ type: 'unknown' })).toThrow();
    });
  });

  describe('mcpConfigSchema', () => {
    it('should validate an empty mcpServers record', () => {
      const result = mcpConfigSchema.parse({ mcpServers: {} });
      expect(result.mcpServers).toEqual({});
    });

    it('should validate config with multiple servers', () => {
      const result = mcpConfigSchema.parse({
        mcpServers: {
          local: { command: 'echo' },
          remote: { type: 'sse', url: 'http://localhost:3000' },
        },
      });
      expect(Object.keys(result.mcpServers)).toHaveLength(2);
    });
  });
});

describe('MCPService — singleton', () => {
  beforeEach(() => {
    // Reset singleton between tests
    (MCPService as any)._instance = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the same instance on repeated calls', () => {
    const a = MCPService.getInstance();
    const b = MCPService.getInstance();
    expect(a).toBe(b);
  });

  it('should create a new instance after reset', () => {
    const a = MCPService.getInstance();
    (MCPService as any)._instance = undefined;
    const b = MCPService.getInstance();
    expect(a).not.toBe(b);
  });
});

describe('MCPService — config validation and updateConfig', () => {
  let service: MCPService;

  beforeEach(() => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();
    vi.mocked(experimental_createMCPClient).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'debug').mockImplementation(() => { /* no-op */ });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw when config has both command and url', async () => {
    vi.mocked(experimental_createMCPClient).mockResolvedValue(createMockClient({}) as any);

    await expect(
      service.updateConfig({
        mcpServers: {
          bad: { command: 'echo', url: 'http://localhost:3000' } as any,
        },
      }),
    ).resolves.toBeDefined();

    const result = service['_mcpToolsPerServer'];
    expect(result.bad.status).toBe('unavailable');
    expect((result.bad as any).error).toContain('command');
  });

  it('should throw when type is missing and url is present (no type inference)', async () => {
    vi.mocked(experimental_createMCPClient).mockResolvedValue(createMockClient({}) as any);

    await service.updateConfig({
      mcpServers: {
        bad: { url: 'http://localhost:3000' } as any,
      },
    });

    const result = service['_mcpToolsPerServer'];
    expect(result.bad.status).toBe('unavailable');
    expect((result.bad as any).error).toContain('type');
  });

  it('should create stdio client for stdio config', async () => {
    const mockClient = createMockClient({
      echo: { description: 'Echo tool', execute: vi.fn(async () => 'result') },
    });
    vi.mocked(experimental_createMCPClient).mockResolvedValue(mockClient as any);

    const result = await service.updateConfig({
      mcpServers: {
        local: { command: 'echo', args: ['hello'] } as any,
      },
    });

    expect(result.local.status).toBe('available');
    expect((result.local as any).tools).toHaveProperty('echo');
    expect(experimental_createMCPClient).toHaveBeenCalled();
  });

  it('should create SSE client for SSE config', async () => {
    const mockClient = createMockClient({
      search: { description: 'Search tool', execute: vi.fn() },
    });
    vi.mocked(experimental_createMCPClient).mockResolvedValue(mockClient as any);

    const result = await service.updateConfig({
      mcpServers: {
        remote: { type: 'sse', url: 'http://localhost:3000/sse' },
      },
    });

    expect(result.remote.status).toBe('available');
  });

  it('should create streamable-http client for streamable-http config', async () => {
    const mockClient = createMockClient({
      fetch: { description: 'Fetch tool', execute: vi.fn() },
    });
    vi.mocked(experimental_createMCPClient).mockResolvedValue(mockClient as any);

    const result = await service.updateConfig({
      mcpServers: {
        http: { type: 'streamable-http', url: 'http://localhost:3000/mcp' },
      },
    });

    expect(result.http.status).toBe('available');
  });

  it('should handle client creation failure gracefully', async () => {
    vi.mocked(experimental_createMCPClient).mockRejectedValue(new Error('Connection refused'));

    const result = await service.updateConfig({
      mcpServers: {
        failing: { command: 'bad-cmd' } as any,
      },
    });

    expect(result.failing.status).toBe('unavailable');
    expect((result.failing as any).error).toBe('Connection refused');
    expect((result.failing as any).client).toBeNull();
  });

  it('should handle tool retrieval failure gracefully', async () => {
    const mockClient = createMockClient({});
    mockClient.tools = vi.fn(async () => {
      throw new Error('Tools API unavailable');
    });
    vi.mocked(experimental_createMCPClient).mockResolvedValue(mockClient as any);

    const result = await service.updateConfig({
      mcpServers: {
        noTools: { command: 'server' } as any,
      },
    });

    expect(result.noTools.status).toBe('unavailable');
    expect((result.noTools as any).error).toContain('could not retrieve tools');
  });

  it('should register tools from multiple servers', async () => {
    vi.mocked(experimental_createMCPClient)
      .mockResolvedValueOnce(
        createMockClient({
          tool_a: { description: 'A', execute: vi.fn() },
        }) as any,
      )
      .mockResolvedValueOnce(
        createMockClient({
          tool_b: { description: 'B', execute: vi.fn() },
        }) as any,
      );

    const result = await service.updateConfig({
      mcpServers: {
        server1: { command: 'server1' } as any,
        server2: { command: 'server2' } as any,
      },
    });

    expect(result.server1.status).toBe('available');
    expect(result.server2.status).toBe('available');
    expect(service.tools).toHaveProperty('tool_a');
    expect(service.tools).toHaveProperty('tool_b');
  });

  it('should handle empty config', async () => {
    const result = await service.updateConfig({ mcpServers: {} });
    expect(result).toEqual({});
  });
});

describe('MCPService — tool registration and queries', () => {
  let service: MCPService;

  beforeEach(() => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();
    vi.mocked(experimental_createMCPClient).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should report tool conflicts with a warning', async () => {
    // The scoped logger routes warn() through console.log (not console.warn)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });

    vi.mocked(experimental_createMCPClient)
      .mockResolvedValueOnce(
        createMockClient({
          shared: { description: 'From server1', execute: vi.fn() },
        }) as any,
      )
      .mockResolvedValueOnce(
        createMockClient({
          shared: { description: 'From server2', execute: vi.fn() },
        }) as any,
      );

    await service.updateConfig({
      mcpServers: {
        server1: { command: 's1' } as any,
        server2: { command: 's2' } as any,
      },
    });

    // logger.warn calls console.log(labelText, message) in the Node environment
    expect(logSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Tool conflict'));
  });

  it('isValidToolName should return true for registered tools', async () => {
    vi.mocked(experimental_createMCPClient).mockResolvedValue(
      createMockClient({
        my_tool: { description: 'My tool', execute: vi.fn() },
      }) as any,
    );

    await service.updateConfig({
      mcpServers: { srv: { command: 's' } as any },
    });

    expect(service.isValidToolName('my_tool')).toBe(true);
  });

  it('isValidToolName should return false for unregistered tools', async () => {
    vi.mocked(experimental_createMCPClient).mockResolvedValue(createMockClient({}) as any);

    await service.updateConfig({
      mcpServers: { srv: { command: 's' } as any },
    });

    expect(service.isValidToolName('nonexistent')).toBe(false);
  });

  it('toolsWithoutExecute should strip the execute function', async () => {
    vi.mocked(experimental_createMCPClient).mockResolvedValue(
      createMockClient({
        my_tool: { description: 'My tool', execute: vi.fn() },
      }) as any,
    );

    await service.updateConfig({
      mcpServers: { srv: { command: 's' } as any },
    });

    expect(service.toolsWithoutExecute.my_tool.execute).toBeUndefined();
    expect(service.toolsWithoutExecute.my_tool.description).toBe('My tool');
  });
});

describe('MCPService — processToolCall', () => {
  let service: MCPService;

  beforeEach(async () => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();
    vi.mocked(experimental_createMCPClient).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });

    vi.mocked(experimental_createMCPClient).mockResolvedValue(
      createMockClient({
        search: { description: 'Search the web', execute: vi.fn() },
      }) as any,
    );

    await service.updateConfig({
      mcpServers: { srv: { command: 's' } as any },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write a tool call annotation for a valid tool', () => {
    const dataStream = createMockDataStream();

    service.processToolCall(
      { type: 'tool-call', toolCallId: 'tc-1', toolName: 'search', args: { query: 'test' } },
      dataStream as any,
    );

    expect(dataStream.writeMessageAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'toolCall',
        toolCallId: 'tc-1',
        toolName: 'search',
        serverName: 'srv',
      }),
    );
  });

  it('should not write annotation for an invalid tool name', () => {
    const dataStream = createMockDataStream();

    service.processToolCall(
      { type: 'tool-call', toolCallId: 'tc-2', toolName: 'nonexistent', args: {} },
      dataStream as any,
    );

    expect(dataStream.writeMessageAnnotation).not.toHaveBeenCalled();
  });

  it('should use a default description when tool has none', async () => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();

    vi.mocked(experimental_createMCPClient).mockResolvedValue(
      createMockClient({
        bare_tool: {},
      }) as any,
    );

    await service.updateConfig({ mcpServers: { srv: { command: 's' } as any } });

    const dataStream = createMockDataStream();
    service.processToolCall(
      { type: 'tool-call', toolCallId: 'tc-3', toolName: 'bare_tool', args: {} },
      dataStream as any,
    );

    expect(dataStream.writeMessageAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolDescription: 'No description available',
      }),
    );
  });
});

describe('MCPService — processToolInvocations', () => {
  let service: MCPService;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();
    vi.mocked(experimental_createMCPClient).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });

    mockExecute = vi.fn(async () => 'tool result');
    vi.mocked(experimental_createMCPClient).mockResolvedValue(
      createMockClient({
        search: { description: 'Search tool', execute: mockExecute },
      }) as any,
    );

    await service.updateConfig({
      mcpServers: { srv: { command: 's' } as any },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute the tool when result is APPROVE', async () => {
    const dataStream = createMockDataStream();
    const messages: any[] = [
      {
        role: 'user',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolName: 'search',
              toolCallId: 'tc-1',
              state: 'result',
              result: TOOL_EXECUTION_APPROVAL.APPROVE,
              args: { query: 'hello' },
            },
          },
        ],
      },
    ];

    const result = await service.processToolInvocations(messages, dataStream as any);

    expect(mockExecute).toHaveBeenCalledWith(
      { query: 'hello' },
      expect.objectContaining({ toolCallId: 'tc-1' }),
    );
    expect(dataStream.write).toHaveBeenCalled();

    const lastPart = result[0].parts![0] as any;
    expect(lastPart.toolInvocation.result).toBe('tool result');
  });

  it('should set DENIED result when user rejects', async () => {
    const dataStream = createMockDataStream();
    const messages: any[] = [
      {
        role: 'user',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolName: 'search',
              toolCallId: 'tc-2',
              state: 'result',
              result: TOOL_EXECUTION_APPROVAL.REJECT,
              args: {},
            },
          },
        ],
      },
    ];

    const result = await service.processToolInvocations(messages, dataStream as any);

    expect(mockExecute).not.toHaveBeenCalled();
    const lastPart = result[0].parts![0] as any;
    expect(lastPart.toolInvocation.result).toBe(TOOL_EXECUTION_DENIED);
  });

  it('should set NO_EXECUTE_FUNCTION when tool has no execute function', async () => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();

    vi.mocked(experimental_createMCPClient).mockResolvedValue(
      createMockClient({
        noexec: { description: 'No exec tool' },
      }) as any,
    );

    await service.updateConfig({ mcpServers: { srv: { command: 's' } as any } });

    const dataStream = createMockDataStream();
    const messages: any[] = [
      {
        role: 'user',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolName: 'noexec',
              toolCallId: 'tc-3',
              state: 'result',
              result: TOOL_EXECUTION_APPROVAL.APPROVE,
              args: {},
            },
          },
        ],
      },
    ];

    const result = await service.processToolInvocations(messages, dataStream as any);
    const lastPart = result[0].parts![0] as any;
    expect(lastPart.toolInvocation.result).toBe(TOOL_NO_EXECUTE_FUNCTION);
  });

  it('should set ERROR result when tool execute throws', async () => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();

    const failingExecute = vi.fn(async () => {
      throw new Error('Execution failed');
    });
    vi.mocked(experimental_createMCPClient).mockResolvedValue(
      createMockClient({
        failing: { description: 'Failing tool', execute: failingExecute },
      }) as any,
    );

    await service.updateConfig({ mcpServers: { srv: { command: 's' } as any } });

    const dataStream = createMockDataStream();
    const messages: any[] = [
      {
        role: 'user',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolName: 'failing',
              toolCallId: 'tc-4',
              state: 'result',
              result: TOOL_EXECUTION_APPROVAL.APPROVE,
              args: {},
            },
          },
        ],
      },
    ];

    const result = await service.processToolInvocations(messages, dataStream as any);
    const lastPart = result[0].parts![0] as any;
    expect(lastPart.toolInvocation.result).toBe(TOOL_EXECUTION_ERROR);
  });

  it('should pass through parts that are not tool-invocations', async () => {
    const dataStream = createMockDataStream();
    const messages: any[] = [
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'hello' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolName: 'search',
              toolCallId: 'tc-5',
              state: 'call', // not 'result', so should be passed through
              args: {},
            },
          },
        ],
      },
    ];

    const result = await service.processToolInvocations(messages, dataStream as any);
    expect(result[0].parts![0] as any).toEqual({ type: 'text', text: 'hello' });
    expect((result[0].parts![1] as any).toolInvocation.state).toBe('call');
    expect(dataStream.write).not.toHaveBeenCalled();
  });

  it('should pass through parts with unhandled result values', async () => {
    const dataStream = createMockDataStream();
    const messages: any[] = [
      {
        role: 'user',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolName: 'search',
              toolCallId: 'tc-6',
              state: 'result',
              result: 'some-unhandled-value',
              args: {},
            },
          },
        ],
      },
    ];

    const result = await service.processToolInvocations(messages, dataStream as any);
    // The part should be returned as-is
    expect((result[0].parts![0] as any).toolInvocation.result).toBe('some-unhandled-value');
    expect(dataStream.write).not.toHaveBeenCalled();
  });

  it('should pass through parts for unregistered tools', async () => {
    const dataStream = createMockDataStream();
    const messages: any[] = [
      {
        role: 'user',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              toolName: 'unknown_tool',
              toolCallId: 'tc-7',
              state: 'result',
              result: TOOL_EXECUTION_APPROVAL.APPROVE,
              args: {},
            },
          },
        ],
      },
    ];

    const result = await service.processToolInvocations(messages, dataStream as any);
    expect((result[0].parts![0] as any).toolInvocation.result).toBe(TOOL_EXECUTION_APPROVAL.APPROVE);
    expect(dataStream.write).not.toHaveBeenCalled();
  });

  it('should return messages as-is when last message has no parts', async () => {
    const dataStream = createMockDataStream();
    const messages: any[] = [{ role: 'user', content: 'hello' }];

    const result = await service.processToolInvocations(messages, dataStream as any);
    expect(result).toBe(messages);
  });
});

describe('MCPService — checkServersAvailabilities', () => {
  let service: MCPService;

  beforeEach(() => {
    (MCPService as any)._instance = undefined;
    service = MCPService.getInstance();
    vi.mocked(experimental_createMCPClient).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should re-check available servers and maintain status', async () => {
    const tools = { tool_a: { description: 'A', execute: vi.fn() } };
    vi.mocked(experimental_createMCPClient).mockResolvedValue(createMockClient(tools) as any);

    // Initial config
    await service.updateConfig({
      mcpServers: { srv: { command: 's' } as any },
    });

    // Reset tools to simulate a fresh check
    vi.mocked(experimental_createMCPClient).mockResolvedValue(createMockClient(tools) as any);

    const result = await service.checkServersAvailabilities();
    expect(result.srv.status).toBe('available');
  });

  it('should mark server unavailable when re-check fails', async () => {
    const tools = { tool_a: { description: 'A', execute: vi.fn() } };
    vi.mocked(experimental_createMCPClient).mockResolvedValue(createMockClient(tools) as any);

    await service.updateConfig({
      mcpServers: { srv: { command: 's' } as any },
    });

    // checkServersAvailabilities reuses the existing client if it's not null,
    // so we must null it out to force a new client creation attempt.
    (service['_mcpToolsPerServer'].srv as any).client = null;

    // Now make the client creation fail
    vi.mocked(experimental_createMCPClient).mockRejectedValue(new Error('Server down'));

    const result = await service.checkServersAvailabilities();
    expect(result.srv.status).toBe('unavailable');
  });
});