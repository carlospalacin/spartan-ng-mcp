import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpartanError, SpartanErrorCode } from '../errors/errors.js';
import { GitHubClient } from './github.js';

let client: GitHubClient;

beforeEach(() => {
  client = new GitHubClient();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockGitHubResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          ...headers,
        },
      }),
    ),
  );
}

describe('GitHubClient', () => {
  describe('fetchFile', () => {
    it('fetches and decodes file content', async () => {
      const content = Buffer.from('export const x = 1;').toString('base64');
      mockGitHubResponse({ content, sha: 'abc123', size: 20, path: 'src/test.ts' });
      const file = await client.fetchFile('src/test.ts');
      expect(file.content).toBe('export const x = 1;');
      expect(file.sha).toBe('abc123');
      expect(file.path).toBe('src/test.ts');
    });

    it('rejects path traversal', async () => {
      await expect(client.fetchFile('../etc/passwd')).rejects.toThrow(SpartanError);
      await expect(client.fetchFile('/absolute')).rejects.toThrow(SpartanError);
      await expect(client.fetchFile('path\\back')).rejects.toThrow(SpartanError);
    });

    it('rejects null bytes in path', async () => {
      await expect(client.fetchFile('file\0.ts')).rejects.toThrow(SpartanError);
    });

    it('throws on 404', async () => {
      mockGitHubResponse({}, 404);
      try {
        await client.fetchFile('missing.ts');
      } catch (e) {
        expect(e).toBeInstanceOf(SpartanError);
        expect((e as SpartanError).code).toBe(SpartanErrorCode.COMPONENT_NOT_FOUND);
      }
    });

    it('throws on oversized file', async () => {
      mockGitHubResponse({ content: '', sha: 'x', size: 10 * 1024 * 1024, path: 'big.ts' });
      await expect(client.fetchFile('big.ts')).rejects.toThrow(SpartanError);
    });
  });

  describe('fetchDirectory', () => {
    it('returns directory entries', async () => {
      mockGitHubResponse([
        { name: 'index.ts', path: 'src/index.ts', type: 'file', size: 100, sha: 'a' },
        { name: 'lib', path: 'src/lib', type: 'dir', size: 0, sha: 'b' },
      ]);
      const entries = await client.fetchDirectory('src');
      expect(entries).toHaveLength(2);
      expect(entries[0].name).toBe('index.ts');
      expect(entries[0].type).toBe('file');
      expect(entries[1].type).toBe('dir');
    });

    it('throws on non-array response', async () => {
      mockGitHubResponse({ name: 'file.ts', type: 'file' });
      await expect(client.fetchDirectory('src')).rejects.toThrow(SpartanError);
    });
  });

  describe('fetchDirectoryFiles', () => {
    it('fetches TypeScript files from directory', async () => {
      const mockFetch = vi.fn();
      // First call: directory listing
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { name: 'index.ts', path: 'src/index.ts', type: 'file', size: 50, sha: 'a' },
            { name: 'readme.md', path: 'src/readme.md', type: 'file', size: 50, sha: 'b' },
          ]),
          {
            status: 200,
            headers: {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '4998',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            },
          },
        ),
      );
      // Second call: file content for index.ts
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: Buffer.from('const x = 1;').toString('base64'),
            sha: 'a',
            size: 12,
            path: 'src/index.ts',
          }),
          {
            status: 200,
            headers: {
              'x-ratelimit-limit': '5000',
              'x-ratelimit-remaining': '4997',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            },
          },
        ),
      );
      vi.stubGlobal('fetch', mockFetch);

      const files = await client.fetchDirectoryFiles('src');
      expect(files).toHaveLength(1); // Only .ts file
      expect(files[0].name).toBe('index.ts');
    });

    it('respects max depth', async () => {
      const files = await client.fetchDirectoryFiles('src', 6); // > MAX_DIR_DEPTH
      expect(files).toEqual([]);
    });
  });

  describe('fetchRaw', () => {
    it('fetches raw file content', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('raw content', { status: 200 })),
      );
      const content = await client.fetchRaw('libs/brain/dialog/src/index.ts');
      expect(content).toBe('raw content');
    });

    it('rejects path traversal', async () => {
      await expect(client.fetchRaw('../evil')).rejects.toThrow(SpartanError);
    });

    it('throws on error response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('', { status: 404 })),
      );
      await expect(client.fetchRaw('missing.ts')).rejects.toThrow(SpartanError);
    });
  });

  describe('error handling', () => {
    it('throws generic error on 500', async () => {
      mockGitHubResponse({}, 500);
      try {
        await client.fetchFile('test.ts');
      } catch (e) {
        expect((e as SpartanError).code).toBe(SpartanErrorCode.NETWORK_ERROR);
      }
    });

    it('throws on timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => {
          const error = new DOMException('aborted', 'AbortError');
          return Promise.reject(error);
        }),
      );
      try {
        await client.fetchFile('test.ts');
      } catch (e) {
        expect((e as SpartanError).code).toBe(SpartanErrorCode.TIMEOUT);
      }
    });

    it('throws on generic fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection refused')));
      try {
        await client.fetchFile('test.ts');
      } catch (e) {
        expect((e as SpartanError).code).toBe(SpartanErrorCode.NETWORK_ERROR);
      }
    });
  });

  describe('rate limiting', () => {
    it('throws rate limited on 403 with 0 remaining', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('', {
            status: 403,
            headers: {
              'x-ratelimit-limit': '60',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
            },
          }),
        ),
      );
      await expect(client.fetchFile('test.ts')).rejects.toThrow(SpartanError);
    });
  });

  describe('getRateLimit', () => {
    it('returns rate limit info', () => {
      const info = client.getRateLimit();
      expect(info).toHaveProperty('limit');
      expect(info).toHaveProperty('remaining');
      expect(info).toHaveProperty('resetAt');
      expect(info).toHaveProperty('hasToken');
      expect(info).toHaveProperty('resetAtISO');
    });
  });

  describe('getRateLimit', () => {
    it('returns rate limit info', () => {
      const info = client.getRateLimit();
      expect(info).toHaveProperty('limit');
      expect(info).toHaveProperty('remaining');
      expect(info).toHaveProperty('resetAt');
      expect(info).toHaveProperty('hasToken');
      expect(info).toHaveProperty('resetAtISO');
    });
  });
});
