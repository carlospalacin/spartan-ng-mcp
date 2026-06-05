## Context

The MCP server runs as a short-lived **stdio** process spawned and killed by the IDE.
Registry data ships as a static `src/registry/registry.json` baked into the package and is
only refreshed manually via `spartan_registry_refresh`, whose result lives in memory and
dies with the process. There is no durable way to keep a user's data fresh between npm
releases.

Two facts discovered during exploration shape this design (see `proposal.md`):

1. The current cache dir, `join(PROJECT_ROOT, 'cache')` (`src/index.ts:32`), resolves
   **inside the read-only package tree** under `npx`/global install. `FileCache` already
   writes there — a latent bug.
2. Component `category` is derived by a static map in `scripts/generate-registry.ts:90`
   (`categorize()`), **not** returned by the Analog API. The runtime refresh path
   (`src/tools/cache.ts:169`) hardcodes `category: 'misc'`, so any persisted SWR refresh
   would degrade fidelity for all 56 components.

Constraints:
- **stdio transport owns stdout** — all diagnostics must go to `stderr` only. A stray
  `console.log` in the refresh path corrupts the JSON-RPC stream.
- `RegistryLoader` read methods (`getComponent`, `listComponents`, …) are **synchronous**.
- No new network hosts; `safeFetch` / `ALLOWED_HOSTS` unchanged.
- The packaged `registry.json` is the permanent offline floor.

## Goals / Non-Goals

**Goals:**
- Persist a per-user registry cache with an embedded `lastRefreshedAt` so freshness
  survives process death.
- Stale-while-revalidate: serve immediately, refresh in the background only past the TTL,
  persist atomically so the *next* session boots fresh.
- A background refresh must **never** lower data fidelity below the packaged snapshot.
- A single, well-defined staleness clock (24h, `SPARTAN_CACHE_TTL_HOURS`).
- Move the whole on-disk cache to a writable per-user location.

**Non-Goals:**
- CI-scheduled `generate-registry` (separate proposal).
- Storing per-component detail (inputs/outputs/examples) in the registry cache — that stays
  live via `analogApi.getComponent` + `CacheManager`.
- Synchronous/blocking refresh on any request path.
- Runtime GitHub block traversal as a primary path (deferred to the generator).

## Decisions

### D1 — Writable cache dir resolver (`src/utils/paths.ts`), shared by the whole cache
Resolve `SPARTAN_MCP_CACHE_DIR` → `$XDG_CACHE_HOME/spartan-ng-mcp` →
`~/.cache/spartan-ng-mcp`. `src/index.ts` feeds this into `CacheManager` (replacing
`PROJECT_ROOT/cache`), so registry cache **and** `FileCache` share one writable root.
- *Why:* fixes the install-tree write bug once, for all consumers.
- *Alternatives:* keep a separate dir per feature (more code, two bugs to track); write
  beside the package (rejected — read-only under npx/global).
- *Guard:* the resolver asserts the result is **not** inside the package dir.

### D2 — One cache file, timestamp embedded
`<cacheDir>/registry.cache.json` = `{ lastRefreshedAt: ISO, registry: <SpartanRegistry> }`.
- *Why:* data and timestamp can never desync; one atomic unit.
- *Alternatives:* sidecar `.last-refresh` file (two writes, two failure modes, drift).

### D3 — SWR hook at `initialize()` only, fire-and-forget
The staleness check + background refresh trigger live in `RegistryLoader.initialize()` (server
start), not on every read.
- *Why:* read methods are synchronous (per-access async would ripple through every tool);
  the process is per-session, so "once at startup" is the only meaningful trigger.
- *Consequence (honest framing):* if the IDE kills the process before the background fetch
  completes, nothing persists — the win lands on the **next** session, not the current one.
- *Alternatives:* make reads async (large blast radius, rejected); a synchronous blocking
  refresh (violates a Non-Goal).

### D4 — Crash-safe atomic write
Write to `<cacheDir>/registry.cache.json.<tmp>` then `rename()` over the target. Temp file
lives in the **same directory** so `rename` is atomic on one filesystem.
- *Why:* a process killed mid-write never leaves a corrupt cache file.
- *Alternatives:* write-in-place (corruptible); fsync dance (overkill for a regenerable cache).

### D5 — Concurrency: in-memory guard + liveness-checked lockfile
An in-process `refreshing` boolean blocks duplicate triggers within one process. A
`<cacheDir>/registry.refresh.lock` (containing PID + start time) coordinates the multiple
server processes a multi-window IDE spawns. The lock is ignored if its PID is dead **or**
its age exceeds a cap (e.g. 2× fetch timeout).
- *Why:* prevents a stale lock (process killed mid-refresh) from deadlocking all future
  refreshes.
- *Worst case:* two processes refresh simultaneously → two fetches, last atomic rename wins;
  correctness preserved, only redundant bandwidth.
- *Alternatives:* `proper-lockfile` dependency (adds a dep for best-effort coordination —
  rejected to stay dependency-free); OS advisory locks (portability cost).

### D6 — Fidelity preservation via shared `categorize()`
Extract `categorize()` into `src/registry/categorize.ts`, imported by **both**
`scripts/generate-registry.ts` and the refresh path. The refresh rebuilds components with
the same categorization the generator uses, and **preserves existing `blocks` and `docs`**
from the current registry (the refresh tool already does this for blocks/docs).
- *Why:* a refresh now produces data equal in fidelity to the packaged snapshot — never
  `misc`-flattened.
- *Invariant:* a refresh must never write a component whose category is `misc` when the map
  knows a better bucket.

### D7 — Unified 24h staleness clock
`lastRefreshedAt` + a single SWR window (default 24h, `SPARTAN_CACHE_TTL_HOURS`) drives every
staleness decision. `RegistryLoader.isStale()` becomes a thin wrapper over `lastRefreshedAt`;
build-time `generatedAt` survives only as informational metadata in `spartan_cache status`.
- *Why:* one knob, one mental model; eliminates the 168h-vs-24h contradiction in
  `spartan_registry_refresh`.
- *Alternatives:* keep two clocks (more precise, two concepts to explain — rejected, see
  proposal decision).

### D8 — Load precedence; loader still never writes
`initialize()`: schema-valid `<cacheDir>/registry.cache.json` → packaged `registry.json` →
empty registry. All writes go through the refresh coordinator / `CacheManager`.
- *Why:* cache wins when present and valid; packaged JSON is the floor; an invalid/partial
  cache file silently falls through instead of throwing.

### D9 — Lightweight refresh payload (matches `spartanRegistrySchema`)
The refresh fetches the Analog API index only (names, brain/helm availability, directives,
category, packages). Per-component detail is **not** persisted here.
- *Why:* matches the existing registry contract; one already-cached Analog call; no schema
  expansion.

### D10 — `CacheManager` extended, not created
`src/cache/cache-manager.ts` already exists (memory→file→fetcher orchestrator with a test).
This change **adds** atomic registry-cache read/write + TTL helpers; `stats()` / `clear()`
stay.

## Risks / Trade-offs

- **Process dies before refresh persists** → wasted fetch, no corruption (D4). *Mitigation:*
  accept; reframe benefit as "next session" (D3). Atomic rename guarantees no partial file.
- **Stale lockfile deadlocks refreshes** → *Mitigation:* PID-liveness + age-cap check (D5).
- **Two processes refresh at once** → redundant bandwidth. *Mitigation:* last atomic write
  wins; correctness intact (D5).
- **Analog API shape changes** → `analogResponseSchema.safeParse` throws
  `API_SCHEMA_CHANGED`; refresh fails → timestamp + file untouched → retried next start;
  packaged floor still serves (D8). *Mitigation:* failure path already isolated.
- **Cache dir read-only / unwritable** → writes are non-fatal (caught); serve packaged data;
  diagnostics to **stderr only** (never stdout — would corrupt JSON-RPC). *Mitigation:*
  swallow write errors as today's `FileCache.set` does.
- **Schema-invalid or version-mismatched cache file** → load precedence falls through to
  packaged JSON; never throws (D8).
- **Clock moved backwards** → `lastRefreshedAt` could read as future and look fresh forever.
  *Mitigation:* `force=true` on `spartan_registry_refresh` always bypasses; low severity.
- **Orphaned old `PROJECT_ROOT/cache`** after the dir move → harmless leftover. *Mitigation:*
  ignore (or a one-line best-effort cleanup — see Open Questions).

## Migration Plan

Purely additive; no data migration. The first write simply lands in the new per-user dir;
the old `PROJECT_ROOT/cache` (if any) is orphaned and ignorable. Inert without a cache file.

**Rollback:** delete `<cacheDir>/registry.cache.json` (reverts to packaged snapshot); set a
very high `SPARTAN_CACHE_TTL_HOURS` (disables background refresh); revert the commit (removes
the writable path entirely — packaged `registry.json` is the floor, no migration needed).

## Open Questions

- Best-effort cleanup of a pre-existing `PROJECT_ROOT/cache`, or leave it orphaned? (Leaning
  leave it — zero risk, trivial disk.)
- Lockfile format: PID + ISO start-time in JSON, or just PID? (Leaning PID + start-time for
  the age-cap check in D5.)
- Should `spartan_registry_refresh` also opportunistically populate `spartanImports` when a
  `GITHUB_TOKEN` is present, or keep that strictly in the generator? (Proposal defers; revisit
  if users report empty block imports.)
