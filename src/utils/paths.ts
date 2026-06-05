import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpartanError, SpartanErrorCode } from '../errors/errors.js';

/**
 * Root of the installed package tree. In dev this is the repo root; in a
 * published install it is the package directory under node_modules / the global
 * install. The packaged `src/registry/registry.json` lives here and is read-only,
 * so the writable cache must never resolve inside this directory.
 */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function assertOutsidePackage(dir: string): string {
  const resolved = resolve(dir);
  if (resolved === PACKAGE_ROOT || resolved.startsWith(PACKAGE_ROOT + sep)) {
    throw new SpartanError(`Refusing to use a cache directory inside the package tree: ${resolved}`, {
      code: SpartanErrorCode.VALIDATION_ERROR,
      context: { dir: resolved, packageRoot: PACKAGE_ROOT },
      suggestion: 'Set SPARTAN_MCP_CACHE_DIR or XDG_CACHE_HOME to a writable location outside the install tree.',
    });
  }
  return resolved;
}

/**
 * Resolve the per-user writable cache directory.
 *
 * Precedence: `SPARTAN_MCP_CACHE_DIR` → `$XDG_CACHE_HOME/spartan-ng-mcp` →
 * `~/.cache/spartan-ng-mcp`. The result is guaranteed not to be inside the
 * installed package tree.
 */
export function resolveCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.SPARTAN_MCP_CACHE_DIR?.trim();
  if (explicit) return assertOutsidePackage(explicit);

  const xdg = env.XDG_CACHE_HOME?.trim();
  if (xdg) return assertOutsidePackage(join(xdg, 'spartan-ng-mcp'));

  return assertOutsidePackage(join(homedir(), '.cache', 'spartan-ng-mcp'));
}
