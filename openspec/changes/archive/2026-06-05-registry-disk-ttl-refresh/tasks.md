## 1. Writable cache location

- [x] 1.1 Create `src/utils/paths.ts` with `resolveCacheDir()` implementing the precedence `SPARTAN_MCP_CACHE_DIR` → `$XDG_CACHE_HOME/spartan-ng-mcp` → `~/.cache/spartan-ng-mcp`
- [x] 1.2 Add a guard that throws/asserts the resolved dir is not inside the package tree
- [x] 1.3 Add `REGISTRY_CACHE_FILENAME` to `src/utils/constants.ts`
- [x] 1.4 Write `src/utils/paths.test.ts` covering env permutations and the never-inside-package assertion
- [x] 1.5 Update `src/index.ts` to source the cache dir from `resolveCacheDir()` instead of `join(PROJECT_ROOT, 'cache')`

## 2. Fidelity preservation

- [x] 2.1 Extract `categorize()` from `scripts/generate-registry.ts` into `src/registry/categorize.ts` (pure, dependency-free)
- [x] 2.2 Update `scripts/generate-registry.ts` to import the shared `categorize()`
- [x] 2.3 Add a unit test asserting the shared map produces the same categories as the committed `registry.json`

## 3. CacheManager + atomic registry-cache I/O

- [x] 3.1 Extend `src/cache/cache-manager.ts` with atomic read of `registry.cache.json` (returns registry + `lastRefreshedAt`, missing → null)
- [x] 3.2 Add atomic write (temp file in same dir + `rename()`) of the registry cache, with `lastRefreshedAt` stamping
- [x] 3.3 Add TTL helper(s) using `SPARTAN_CACHE_TTL_HOURS` (default 24h)
- [x] 3.4 Ensure all write failures are non-fatal and all diagnostics go to `stderr` only (never stdout)
- [x] 3.5 Extend `src/cache/cache-manager.test.ts` for atomic write/read and missing-file behavior

## 4. Refresh coordinator (SWR)

- [x] 4.1 Create `src/registry/refresh.ts` exposing a `maybeRefresh()` that reads `lastRefreshedAt`, compares against the TTL, and triggers at most one non-blocking refresh when stale
- [x] 4.2 Implement the refresh: fetch Analog API index, rebuild components via shared `categorize()`, preserve existing `blocks`/`docs`, validate with `spartanRegistrySchema`
- [x] 4.3 On success, persist atomically and update `lastRefreshedAt`; on failure, leave cache file and timestamp untouched
- [x] 4.4 Add in-memory `refreshing` guard
- [x] 4.5 Add lockfile (PID + start-time) with stale detection (dead PID or age over cap)
- [x] 4.6 Write `src/registry/refresh.test.ts` — SWR matrix: fresh/stale/missing timestamp; success updates timestamp + file atomically; failure preserves prior state; concurrency guard fires once under two simultaneous accesses; stale lockfile is ignored

## 5. RegistryLoader integration

- [x] 5.1 Update `RegistryLoader.initialize()` load precedence: schema-valid cache file → packaged `registry.json` → empty (no writes, no throw on missing/invalid)
- [x] 5.2 Hook the SWR check (`maybeRefresh()`, fire-and-forget) into `initialize()`
- [x] 5.3 Rewrite `RegistryLoader.isStale()` to evaluate against `lastRefreshedAt` and the unified TTL; keep `generatedAt` as informational only
- [x] 5.4 Extend `src/registry/registry.test.ts` for load precedence (cache over packaged, both invalid → empty) and the new `isStale()` behavior

## 6. Tool surface

- [x] 6.1 Update `spartan_cache action=status` to report `lastRefreshedAt`, resolved cache-file path, and time-until-stale (with `generatedAt` as informational)
- [x] 6.2 Update `spartan_registry_refresh` to persist to the writable cache file and to bypass the TTL on `force=true`
- [x] 6.3 Ensure the refresh path uses shared `categorize()` (remove the hardcoded `category: 'misc'` at `cache.ts:169`)

## 7. Verification

- [x] 7.1 Run `npm run typecheck` clean
- [x] 7.2 Run `vitest run` — all suites green, no regression in cache/registry suites
- [x] 7.3 Manual smoke: delete cache file → packaged snapshot served; force refresh → cache file written outside package tree with updated timestamp; second run within TTL makes no network call
