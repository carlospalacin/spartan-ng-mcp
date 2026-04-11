import { describe, expect, it } from 'vitest';
import {
  ALLOWED_HOSTS,
  ANALOG_API_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_HOURS,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_FETCH_TIMEOUT_MS,
  DOCUMENTATION_TOPICS,
  GITHUB_API_BASE,
  GITHUB_RAW_BASE,
  SPARTAN_ANALOG_API_URL,
  SPARTAN_BLOCKS_BASE,
  SPARTAN_COMPONENTS_BASE,
  SPARTAN_DOCS_BASE,
  SPARTAN_REPO,
  SPARTAN_REPO_BRANCH,
} from './constants.js';

describe('constants', () => {
  it('has correct Spartan URLs', () => {
    expect(SPARTAN_DOCS_BASE).toContain('spartan.ng');
    expect(SPARTAN_COMPONENTS_BASE).toContain('spartan.ng');
    expect(SPARTAN_BLOCKS_BASE).toContain('spartan.ng');
    expect(SPARTAN_ANALOG_API_URL).toContain('spartan.ng/api');
  });

  it('has correct GitHub URLs', () => {
    expect(GITHUB_API_BASE).toBe('https://api.github.com');
    expect(GITHUB_RAW_BASE).toBe('https://raw.githubusercontent.com');
  });

  it('has correct repo info', () => {
    expect(SPARTAN_REPO).toBe('spartan-ng/spartan');
    expect(SPARTAN_REPO_BRANCH).toBe('main');
  });

  it('has allowed hosts', () => {
    expect(ALLOWED_HOSTS).toContain('www.spartan.ng');
    expect(ALLOWED_HOSTS).toContain('api.github.com');
    expect(ALLOWED_HOSTS).toContain('raw.githubusercontent.com');
    expect(ALLOWED_HOSTS.length).toBeGreaterThanOrEqual(3);
  });

  it('has sensible cache defaults', () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(300_000);
    expect(DEFAULT_CACHE_TTL_HOURS).toBe(24);
  });

  it('has sensible timeout defaults', () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(15_000);
    expect(ANALOG_API_TIMEOUT_MS).toBe(30_000);
  });

  it('has documentation topics', () => {
    expect(DOCUMENTATION_TOPICS).toContain('installation');
    expect(DOCUMENTATION_TOPICS).toContain('cli');
    expect(DOCUMENTATION_TOPICS).toContain('theming');
    expect(DOCUMENTATION_TOPICS).toContain('dark-mode');
    expect(DOCUMENTATION_TOPICS.length).toBe(7);
  });
});
