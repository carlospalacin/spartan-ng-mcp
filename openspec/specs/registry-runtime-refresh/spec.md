# registry-runtime-refresh Specification

## Purpose
TBD - created by archiving change registry-disk-ttl-refresh. Update Purpose after archive.
## Requirements
### Requirement: Writable per-user cache directory
The system SHALL resolve a writable cache directory using the precedence
`SPARTAN_MCP_CACHE_DIR` → `$XDG_CACHE_HOME/spartan-ng-mcp` → `~/.cache/spartan-ng-mcp`, and
SHALL NOT resolve a directory inside the installed package tree. This directory SHALL be the
base path for both the registry cache and the existing file cache.

#### Scenario: SPARTAN_MCP_CACHE_DIR takes precedence
- **WHEN** `SPARTAN_MCP_CACHE_DIR` is set to a writable path
- **THEN** the resolved cache directory equals that path

#### Scenario: Falls back to XDG then home
- **WHEN** `SPARTAN_MCP_CACHE_DIR` is unset and `XDG_CACHE_HOME` is set
- **THEN** the resolved directory is `$XDG_CACHE_HOME/spartan-ng-mcp`
- **WHEN** neither is set
- **THEN** the resolved directory is `~/.cache/spartan-ng-mcp`

#### Scenario: Never inside the package tree
- **WHEN** the cache directory is resolved under any environment permutation
- **THEN** the resolved path is not contained within the installed package directory

### Requirement: Persisted registry cache with embedded timestamp
The system SHALL persist the refreshed registry to `<cacheDir>/registry.cache.json` as a
single object containing the full registry (matching `spartanRegistrySchema`) and a
`lastRefreshedAt` ISO-8601 timestamp. The timestamp MUST reside in the same file as the data.

#### Scenario: Cache file structure
- **WHEN** a refresh persists the registry
- **THEN** `registry.cache.json` contains both the registry payload and `lastRefreshedAt`
- **AND** no separate timestamp/sidecar file is created

### Requirement: Load precedence with packaged floor
On initialization the system SHALL load a schema-valid `<cacheDir>/registry.cache.json` if
present, otherwise the packaged `registry.json`, otherwise an empty registry. The loader
SHALL NOT write to disk and SHALL NOT throw when the cache file is missing or invalid.

#### Scenario: Valid cache file wins
- **WHEN** `registry.cache.json` exists and is schema-valid
- **THEN** the loader serves the cache file contents

#### Scenario: Missing cache file falls back to packaged snapshot
- **WHEN** `registry.cache.json` is absent
- **THEN** the loader serves the packaged `registry.json`
- **AND** no write occurs inside the package tree

#### Scenario: Invalid cache file falls through
- **WHEN** `registry.cache.json` exists but fails schema validation
- **THEN** the loader falls back to the packaged `registry.json` without throwing

### Requirement: Stale-while-revalidate background refresh
On server start the system SHALL read `lastRefreshedAt` (a missing value treated as epoch 0).
When the age is within the TTL the system SHALL serve current data and perform no network
request. When the age exceeds the TTL the system SHALL serve current data immediately and
trigger exactly one non-blocking background refresh.

#### Scenario: Fresh cache performs no network request
- **WHEN** `lastRefreshedAt` is within the TTL at startup
- **THEN** the registry is served from existing data
- **AND** no Analog API request is made on registry access

#### Scenario: Stale cache serves immediately and refreshes in background
- **WHEN** `lastRefreshedAt` is older than the TTL at startup
- **THEN** the registry access returns immediately with existing data
- **AND** a single background refresh is triggered

### Requirement: Refresh never lowers data fidelity
A persisted refresh SHALL derive component `category` from the shared categorization map used
by the registry generator and SHALL preserve existing `blocks` and `docs`. A refresh MUST NOT
write `misc` for a component the categorization map can classify, and MUST NOT produce a
registry of lower fidelity than the snapshot it replaces.

#### Scenario: Categories preserved on refresh
- **WHEN** a refresh rebuilds the component index
- **THEN** each component's category equals the value the generator's categorize map yields
- **AND** no categorizable component is written as `misc`

### Requirement: Atomic, crash-safe writes
The system SHALL write the registry cache to a temporary file in the same directory and then
atomically `rename()` it over the target. A process interrupted mid-write MUST NOT leave a
corrupt `registry.cache.json`.

#### Scenario: Atomic replacement
- **WHEN** a refresh writes the cache file
- **THEN** the write occurs via temp-file-plus-rename
- **AND** an interruption before rename leaves the previous cache file intact

### Requirement: Failed refresh preserves prior state
The system SHALL, when a background refresh fails (network error, timeout, or API schema
change), leave the existing `registry.cache.json` and `lastRefreshedAt` untouched so the next
start retries.

#### Scenario: Failure does not record a non-refresh as success
- **WHEN** a background refresh throws
- **THEN** the cache file is not modified
- **AND** `lastRefreshedAt` is unchanged

### Requirement: Concurrency coordination
The system SHALL prevent duplicate refreshes within a single process via an in-memory guard
and SHALL coordinate across processes via a lockfile. A lockfile whose owning PID is no longer
alive, or whose age exceeds a defined cap, SHALL be treated as stale and ignored.

#### Scenario: Single refresh under concurrent access in one process
- **WHEN** two near-simultaneous accesses both observe a stale cache
- **THEN** exactly one background refresh is triggered

#### Scenario: Stale lockfile does not deadlock
- **WHEN** a lockfile exists whose PID is dead or whose age exceeds the cap
- **THEN** a new refresh is allowed to proceed

### Requirement: Cache status and forced refresh surface staleness
`spartan_cache action=status` SHALL report `lastRefreshedAt`, the resolved cache-file path,
and time-until-stale, with build-time `generatedAt` shown as informational metadata.
`spartan_registry_refresh force=true` SHALL bypass the TTL check, write a new cache file, and
update `lastRefreshedAt`.

#### Scenario: Status reports staleness fields
- **WHEN** `spartan_cache action=status` is invoked
- **THEN** the output includes `lastRefreshedAt`, the cache-file path, and time-until-stale

#### Scenario: Forced refresh persists
- **WHEN** `spartan_registry_refresh force=true` is invoked
- **THEN** a new `registry.cache.json` is written
- **AND** `lastRefreshedAt` is updated to the current time

### Requirement: Single unified staleness window
Registry staleness SHALL be driven by `lastRefreshedAt` and a single configurable window
(default 24 hours, overridable via `SPARTAN_CACHE_TTL_HOURS`). `RegistryLoader.isStale()`
SHALL evaluate against `lastRefreshedAt`; build-time `generatedAt` SHALL NOT drive any
staleness decision.

#### Scenario: TTL override respected
- **WHEN** `SPARTAN_CACHE_TTL_HOURS` is set
- **THEN** the staleness window equals that value for both `isStale()` and SWR

#### Scenario: generatedAt is not a staleness input
- **WHEN** the packaged `generatedAt` is older than the TTL but `lastRefreshedAt` is fresh
- **THEN** the registry is considered fresh and no refresh is triggered

