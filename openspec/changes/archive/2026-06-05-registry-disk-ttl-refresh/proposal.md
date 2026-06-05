## Why

The registry ships as a static `src/registry/registry.json` snapshot baked into the
published package. Between npm releases a user's registry only refreshes if they manually
invoke `spartan_registry_refresh`, and that refresh lives in memory and dies with the
(short-lived, stdio) MCP process. Nothing lets the server notice "this data is N hours
old, quietly go get fresh data."

A `setInterval` does not fit an stdio MCP server: the process is spawned and killed by the
IDE, so an in-process timer has no reliable lifetime. The correct pattern for an ephemeral
process is a **timestamp persisted to disk**, read at startup, driving a
**stale-while-revalidate (SWR)** refresh: serve what we have immediately, refresh in the
background only when the TTL has elapsed, persist the result so the *next* session boots
fresh.

This change adds that mechanism. It also fixes a **pre-existing latent bug** surfaced
during exploration: the current cache directory is `join(PROJECT_ROOT, 'cache')`
(`src/index.ts:32`), which under `npx`/global install resolves *inside the read-only
package tree*. The existing `FileCache` already writes there. A proper per-user writable
cache location is therefore needed for the whole cache subsystem, not just the new
registry cache.

This change deliberately does NOT add CI-side scheduled regeneration of the committed
`registry.json` (separate, complementary proposal); it is purely the runtime layer that
keeps an individual user's data fresh between publishes.

## What Changes

1. **Writable cache-location resolver** (`src/utils/paths.ts`, new). Resolves a per-user
   cache dir: `SPARTAN_MCP_CACHE_DIR` → `$XDG_CACHE_HOME/spartan-ng-mcp` →
   `~/.cache/spartan-ng-mcp`. Must never resolve inside the package dir. **This becomes the
   base path for the existing `CacheManager`/`FileCache` too** (replacing
   `join(PROJECT_ROOT, 'cache')` in `src/index.ts`), closing the install-tree write bug.

2. **Single source-of-truth cache file** at `<cacheDir>/registry.cache.json`, holding the
   full refreshed registry plus a `lastRefreshedAt` ISO timestamp *inside the same file* so
   data and timestamp cannot desynchronize. Runtime `lastRefreshedAt` is intentionally
   distinct from the packaged registry's build-time `generatedAt`. The cached payload
   matches `spartanRegistrySchema` exactly — the lightweight *index* (DECIDED): names,
   brain/helm availability, directives, category, packages. Detailed per-component
   inputs/outputs/examples are **not** stored here; they continue to be fetched live by
   `spartan_view` via `analogApi.getComponent` and cached separately by `CacheManager`.

3. **Refresh coordinator** (`src/registry/refresh.ts`, new) implementing SWR:
   - Read `lastRefreshedAt` (missing → epoch 0). Within TTL → serve current data, do nothing.
   - Past TTL → serve current data immediately, trigger one non-blocking background refresh.
   - Success → write temp file + atomic `rename()`; update `lastRefreshedAt`.
   - Failure → leave the cache file and timestamp untouched so the next access retries.
   - In-memory `refreshing` guard **plus a lockfile with a PID/age liveness check** so a
     process killed mid-refresh does not permanently block future refreshes across the
     multiple server processes a multi-window IDE spawns.

4. **Fidelity preservation — `categorize()` extracted to `src/registry/categorize.ts`**
   (new shared module). Today `category` is derived by a static name→category map that
   lives *only* in `scripts/generate-registry.ts:90`; the Analog API does not return it.
   The runtime refresh path (`src/tools/cache.ts:169`) hardcodes `category: 'misc'`, so an
   SWR refresh would **downgrade every component's category to `misc`** and flatten
   `peerDependencies`. Sharing `categorize()` between the generator and the refresh path
   keeps refreshed data at least as good as the packaged snapshot. **A refresh must never
   produce lower-fidelity data than it replaces.**

5. **Staleness-clock reconciliation — unified to a single 24h window (DECIDED).** Three
   timers currently disagree: `RegistryLoader.isStale(168h)` (build-time `generatedAt`),
   `FileCache` TTL (24h, per-entry `cachedAt`), and the new SWR window;
   `spartan_registry_refresh` short-circuits on the 168h clock while SWR would claim stale
   at 24h. Resolution: **runtime `lastRefreshedAt` + a single SWR window
   (default 24h, `SPARTAN_CACHE_TTL_HOURS`) drives every staleness decision.**
   `RegistryLoader.isStale()` becomes a thin wrapper over `lastRefreshedAt`; build-time
   `generatedAt` is retained only as informational metadata in `spartan_cache status`.

6. **RegistryLoader load precedence** (`src/registry/registry.ts`). On `initialize()`,
   prefer a schema-valid `<cacheDir>/registry.cache.json`, then the packaged
   `registry.json`, then empty. The SWR check is hooked at `initialize()` (server start) —
   the only sane hook, since the loader's read methods are synchronous and the process is
   per-session. The loader still never writes.

7. **Extend `CacheManager`** (`src/cache/cache-manager.ts`, **already exists** — not new).
   Add atomic read/write of the registry cache file and TTL helpers that the refresh
   coordinator and the `spartan_cache` tool need. Existing `stats()`/`clear(scope?)` stay.

8. **`spartan_cache` / `spartan_registry_refresh`** (`src/tools/cache.ts`). Surface
   `lastRefreshedAt`, resolved cache-file path, and time-until-stale in `status`. The
   refresh now persists to the writable cache file (today: memory only); `force` bypasses
   the TTL check.

9. **Constants** (`src/utils/constants.ts`). Add `REGISTRY_CACHE_FILENAME`; confirm the SWR
   window is driven by a documented setting (default 24h, overridable via
   `SPARTAN_CACHE_TTL_HOURS`).

### Reframed / deferred

- **`spartanImports` block discovery is a build-time backfill, not a freshness concern.**
  All 17 blocks ship with `spartanImports: []` (generator leaves them empty,
  `generate-registry.ts:207`). Runtime GitHub traversal is exactly where the unauthenticated
  60/hr budget is exhausted. **Primary fix belongs in `generate-registry.ts`** (runs with a
  token); any runtime discovery is optional, strictly gated by `MAX_DIR_FILES`, and degrades
  silently rather than spending the budget. This is split out of the SWR hot path.

### Non-goals

- No CI cron / scheduled `generate-registry`.
- No change to committed `registry.json` contents.
- No new network hosts — all fetches stay within the existing `ALLOWED_HOSTS` allowlist
  (`safeFetch` unchanged).
- No synchronous/blocking refresh on the request hot path.

## Capabilities

### New Capabilities
- `registry-runtime-refresh`: persisted per-user registry cache with a disk-backed
  `lastRefreshedAt` timestamp, stale-while-revalidate background refresh on server start,
  atomic crash-safe writes, fidelity-preserving category derivation, and cross-process
  refresh coordination. Covers cache-dir resolution, load precedence, the refresh
  coordinator, and the `spartan_cache` / `spartan_registry_refresh` surface.

### Modified Capabilities
<!-- None: openspec/specs/ is currently empty; this is the first capability. -->

## Impact

- **New files**: `src/utils/paths.ts`, `src/registry/refresh.ts`, `src/registry/categorize.ts`,
  plus tests (`src/utils/paths.test.ts`, `src/registry/refresh.test.ts`).
- **Modified**: `src/registry/registry.ts` (load precedence + SWR hook), `src/cache/cache-manager.ts`
  (**extended**, not created — atomic registry-cache I/O + TTL helpers), `src/tools/cache.ts`
  (persist refresh, surface staleness), `src/utils/constants.ts` (`REGISTRY_CACHE_FILENAME`),
  `src/index.ts` (cache dir now from `paths.ts`), `scripts/generate-registry.ts` (import shared
  `categorize()`; optionally populate `spartanImports`).
- **Behavior**: first writable-cache write moves the on-disk cache out of the package tree;
  background refresh persists across sessions; no behavior change when offline or when the
  cache file is absent (packaged snapshot is the permanent floor).
- **Acceptance criteria**:
  - Missing cache file → falls back to packaged snapshot; never throws; never writes into
    the package tree.
  - Fresh cache (within TTL) → no network request on startup.
  - Stale cache → returns immediately AND triggers exactly one background refresh (guard
    verified across two near-simultaneous accesses).
  - Failed refresh → cache file and `lastRefreshedAt` unchanged.
  - Writes are atomic (temp + rename); a process killed mid-write never leaves a corrupt file.
  - A refresh never lowers category/peerDependency fidelity below the packaged snapshot.
  - `spartan_cache status` reports `lastRefreshedAt`, cache-file path, and staleness;
    `spartan_registry_refresh force=true` writes a new cache file and updates the timestamp.
  - Cache dir honors `SPARTAN_MCP_CACHE_DIR` → `XDG_CACHE_HOME` → `~/.cache`.
- **Rollback**: deleting `<cacheDir>/registry.cache.json` reverts to the packaged snapshot;
  a very high `SPARTAN_CACHE_TTL_HOURS` disables background refresh; reverting the commit
  removes the writable path with no migration (packaged `registry.json` is the floor).
