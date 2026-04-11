import { describe, expect, it } from 'vitest';
import {
  SpartanError,
  SpartanErrorCode,
  blockNotFound,
  componentNotFound,
  rateLimited,
  ssrfViolation,
} from './errors.js';

describe('SpartanErrorCode', () => {
  it('has all expected error codes', () => {
    expect(SpartanErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(SpartanErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(SpartanErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(SpartanErrorCode.SSRF_VIOLATION).toBe('SSRF_VIOLATION');
    expect(SpartanErrorCode.COMPONENT_NOT_FOUND).toBe('COMPONENT_NOT_FOUND');
    expect(SpartanErrorCode.BLOCK_NOT_FOUND).toBe('BLOCK_NOT_FOUND');
    expect(SpartanErrorCode.DOC_NOT_FOUND).toBe('DOC_NOT_FOUND');
    expect(SpartanErrorCode.PARSE_ERROR).toBe('PARSE_ERROR');
    expect(SpartanErrorCode.API_SCHEMA_CHANGED).toBe('API_SCHEMA_CHANGED');
    expect(SpartanErrorCode.NO_ANGULAR_PROJECT).toBe('NO_ANGULAR_PROJECT');
    expect(SpartanErrorCode.NO_SPARTAN_INSTALLED).toBe('NO_SPARTAN_INSTALLED');
    expect(SpartanErrorCode.CACHE_READ_ERROR).toBe('CACHE_READ_ERROR');
    expect(SpartanErrorCode.CACHE_WRITE_ERROR).toBe('CACHE_WRITE_ERROR');
    expect(SpartanErrorCode.REGISTRY_STALE).toBe('REGISTRY_STALE');
    expect(SpartanErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(SpartanErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
  });
});

describe('SpartanError', () => {
  it('sets all properties', () => {
    const cause = new Error('root');
    const error = new SpartanError('test message', {
      code: SpartanErrorCode.NETWORK_ERROR,
      suggestion: 'try again',
      context: { url: 'https://example.com' },
      cause,
    });

    expect(error.message).toBe('test message');
    expect(error.name).toBe('SpartanError');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.suggestion).toBe('try again');
    expect(error.context).toEqual({ url: 'https://example.com' });
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.cause).toBe(cause);
  });

  it('works without optional fields', () => {
    const error = new SpartanError('minimal', {
      code: SpartanErrorCode.UNKNOWN_ERROR,
    });

    expect(error.suggestion).toBeUndefined();
    expect(error.context).toBeUndefined();
  });

  it('serializes to JSON', () => {
    const error = new SpartanError('json test', {
      code: SpartanErrorCode.TIMEOUT,
      suggestion: 'wait',
      context: { ms: 5000 },
    });

    const json = error.toJSON();
    expect(json.name).toBe('SpartanError');
    expect(json.message).toBe('json test');
    expect(json.code).toBe('TIMEOUT');
    expect(json.suggestion).toBe('wait');
    expect(json.context).toEqual({ ms: 5000 });
    expect(json.timestamp).toMatch(/^\d{4}-/);
  });

  it('is an instance of Error', () => {
    const error = new SpartanError('test', { code: SpartanErrorCode.UNKNOWN_ERROR });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SpartanError);
  });
});

describe('componentNotFound', () => {
  it('creates error with correct code and context', () => {
    const error = componentNotFound('dialog');
    expect(error.code).toBe('COMPONENT_NOT_FOUND');
    expect(error.message).toContain('dialog');
    expect(error.suggestion).toBeTruthy();
    expect(error.context).toEqual({ name: 'dialog' });
  });
});

describe('blockNotFound', () => {
  it('creates error with correct code and context', () => {
    const error = blockNotFound('sidebar', 'inset');
    expect(error.code).toBe('BLOCK_NOT_FOUND');
    expect(error.message).toContain('sidebar/inset');
    expect(error.suggestion).toBeTruthy();
    expect(error.context).toEqual({ category: 'sidebar', variant: 'inset' });
  });
});

describe('rateLimited', () => {
  it('creates error with reset time', () => {
    const resetAt = Date.now() + 60_000;
    const error = rateLimited(resetAt);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toContain('rate limit');
    expect(error.suggestion).toContain('GITHUB_TOKEN');
    expect(error.context?.resetAt).toBe(resetAt);
    expect(error.context?.resetAtISO).toBeTruthy();
  });
});

describe('ssrfViolation', () => {
  it('creates error with url and hostname', () => {
    const error = ssrfViolation('http://evil.com/data', 'evil.com');
    expect(error.code).toBe('SSRF_VIOLATION');
    expect(error.message).toContain('evil.com');
    expect(error.context).toEqual({ url: 'http://evil.com/data', hostname: 'evil.com' });
  });
});
