import { homedir, tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SpartanError } from '../errors/errors.js';
import { PACKAGE_ROOT, resolveCacheDir } from './paths.js';

describe('resolveCacheDir', () => {
  it('prefers SPARTAN_MCP_CACHE_DIR', () => {
    const dir = join(tmpdir(), 'spartan-explicit-cache');
    expect(resolveCacheDir({ SPARTAN_MCP_CACHE_DIR: dir })).toBe(dir);
  });

  it('falls back to XDG_CACHE_HOME/spartan-ng-mcp', () => {
    const xdg = join(tmpdir(), 'xdg-cache');
    expect(resolveCacheDir({ XDG_CACHE_HOME: xdg })).toBe(join(xdg, 'spartan-ng-mcp'));
  });

  it('falls back to ~/.cache/spartan-ng-mcp', () => {
    expect(resolveCacheDir({})).toBe(join(homedir(), '.cache', 'spartan-ng-mcp'));
  });

  it('SPARTAN_MCP_CACHE_DIR takes precedence over XDG_CACHE_HOME', () => {
    const dir = join(tmpdir(), 'explicit-wins');
    const xdg = join(tmpdir(), 'xdg-loses');
    expect(resolveCacheDir({ SPARTAN_MCP_CACHE_DIR: dir, XDG_CACHE_HOME: xdg })).toBe(dir);
  });

  it('never resolves inside the package tree across default permutations', () => {
    const permutations: NodeJS.ProcessEnv[] = [{}, { XDG_CACHE_HOME: join(tmpdir(), 'xdg') }];
    for (const env of permutations) {
      const dir = resolveCacheDir(env);
      expect(dir === PACKAGE_ROOT || dir.startsWith(PACKAGE_ROOT + sep)).toBe(false);
    }
  });

  it('throws if explicitly pointed inside the package tree', () => {
    expect(() => resolveCacheDir({ SPARTAN_MCP_CACHE_DIR: join(PACKAGE_ROOT, 'cache') })).toThrow(
      SpartanError,
    );
  });

  it('throws if XDG points at the package root', () => {
    expect(() => resolveCacheDir({ XDG_CACHE_HOME: PACKAGE_ROOT })).toThrow(SpartanError);
  });
});
