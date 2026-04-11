import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpartanError, SpartanErrorCode } from '../errors/errors.js';
import { safeFetch } from './fetch.js';

describe('safeFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects non-https URLs', async () => {
    await expect(safeFetch('http://www.spartan.ng/test')).rejects.toThrow(SpartanError);
    try {
      await safeFetch('http://www.spartan.ng/test');
    } catch (e) {
      expect((e as SpartanError).code).toBe(SpartanErrorCode.SSRF_VIOLATION);
    }
  });

  it('rejects URLs with ports', async () => {
    await expect(safeFetch('https://www.spartan.ng:8080/test')).rejects.toThrow(SpartanError);
  });

  it('rejects URLs with credentials', async () => {
    await expect(safeFetch('https://user:pass@www.spartan.ng/test')).rejects.toThrow(SpartanError);
  });

  it('rejects URLs with only username', async () => {
    await expect(safeFetch('https://user@www.spartan.ng/test')).rejects.toThrow(SpartanError);
  });

  it('rejects disallowed hosts', async () => {
    await expect(safeFetch('https://evil.com/data')).rejects.toThrow(SpartanError);
    try {
      await safeFetch('https://evil.com/data');
    } catch (e) {
      expect((e as SpartanError).code).toBe(SpartanErrorCode.SSRF_VIOLATION);
    }
  });

  it('skips SSRF check when skipSsrfCheck is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
    );
    const response = await safeFetch('http://localhost:3000/test', { skipSsrfCheck: true });
    expect(response.ok).toBe(true);
  });

  it('makes request to allowed hosts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
    );
    const response = await safeFetch('https://www.spartan.ng/test');
    expect(response.ok).toBe(true);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' })),
    );
    await expect(safeFetch('https://www.spartan.ng/test')).rejects.toThrow(SpartanError);
    try {
      await safeFetch('https://www.spartan.ng/test');
    } catch (e) {
      expect((e as SpartanError).code).toBe(SpartanErrorCode.NETWORK_ERROR);
    }
  });

  it('throws timeout error on abort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const error = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(error);
      }),
    );
    await expect(safeFetch('https://www.spartan.ng/test', { timeoutMs: 1 })).rejects.toThrow(SpartanError);
    try {
      await safeFetch('https://www.spartan.ng/test', { timeoutMs: 1 });
    } catch (e) {
      expect((e as SpartanError).code).toBe(SpartanErrorCode.TIMEOUT);
    }
  });

  it('throws network error on generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );
    await expect(safeFetch('https://www.spartan.ng/test')).rejects.toThrow(SpartanError);
    try {
      await safeFetch('https://www.spartan.ng/test');
    } catch (e) {
      expect((e as SpartanError).code).toBe(SpartanErrorCode.NETWORK_ERROR);
    }
  });

  it('passes custom headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await safeFetch('https://www.spartan.ng/test', { headers: { 'X-Custom': 'value' } });
    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders['X-Custom']).toBe('value');
    expect(callHeaders['User-Agent']).toBe('spartan-ng-mcp/2.0');
  });

  it('re-throws SpartanError as-is from fetch failures', async () => {
    const original = new SpartanError('custom', { code: SpartanErrorCode.PARSE_ERROR });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(original));
    await expect(safeFetch('https://www.spartan.ng/test')).rejects.toBe(original);
  });
});
