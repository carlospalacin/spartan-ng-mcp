## What This Is

An MCP (Model Context Protocol) server that exposes the Spartan Angular UI ecosystem as tools for IDEs and AI assistants. It provides component discovery, Brain/Helm APIs, source code from GitHub, installation commands, project context detection, and page-level building blocks.

## Commands

- `npm start` — start the MCP server (stdio transport)
- `npm run dev` — start TypeScript compiler in watch mode
- `npm run build` — compile TypeScript to `dist/`
- `npm run generate-registry` — regenerate `registry.json` from live Spartan Analog API
- `npm test` — run tests (vitest)
- `npm run typecheck` — type-check without emitting

## Architecture

**TypeScript throughout** (`"type": "module"`, strict mode). ES2022 target, NodeNext modules.

### Entry Point

`src/index.ts` — creates `McpServer`, initializes services (registry, cache, API clients), registers all tool/resource/prompt modules, connects via `StdioServerTransport`.

### Tool Modules (src/tools/)

Each file exports a `create*Tools()` function returning `ToolDefinition[]`:

| Module | Tools | Purpose |
|--------|-------|---------|
| `discovery.ts` | `spartan_list` / `spartan_search` / `spartan_view` / `spartan_dependencies` | Component discovery, fuzzy search, detailed API view |
| `source.ts` | `spartan_source` / `spartan_block_source` | TypeScript source from GitHub |
| `docs.ts` | `spartan_docs` | Documentation topics from spartan.ng |
| `install.ts` | `spartan_install_command` / `spartan_audit` | CLI command generation, post-install checklist |
| `context.ts` | `spartan_project_info` / `spartan_project_components` | Angular/Nx project detection |
| `cache.ts` | `spartan_cache` / `spartan_registry_refresh` | Cache management, runtime registry refresh |

### Data Sources (3-tier priority)

1. **Static Registry** (`src/registry/registry.json`) — committed per release, zero latency, works offline
2. **Analog API** (`spartan.ng/api/_analog/...`) — runtime fetch with 30min + 24h cache layers
3. **GitHub API** (`api.github.com`) — source code only, rate-limited (60/hr or 5000/hr with token)

### Key Modules

| Module | Purpose |
|--------|---------|
| `registry/registry.ts` | RegistryLoader — loads static JSON, provides lookup/search, supports runtime refresh |
| `registry/schema.ts` | Zod schemas for registry validation |
| `data/analog-api.ts` | Spartan Analog API client — bulk fetch for all component data |
| `data/github.ts` | GitHub API client — file/directory fetching with rate limit tracking |
| `cache/memory-cache.ts` | Generic LRU cache with TTL |
| `cache/file-cache.ts` | Versioned file cache with path traversal protection |
| `cache/cache-manager.ts` | Orchestrator: memory → file → network |
| `project/detector.ts` | Angular/Nx/Tailwind/zoneless project scanner |
| `search/fuzzy.ts` | fuzzysort wrapper for component search |
| `errors/errors.ts` | SpartanError hierarchy with 17 error codes |
| `resources/spartan.ts` | MCP resource handlers (spartan:// URI scheme) |
| `prompts/workflows.ts` | MCP prompt handlers (5 workflow templates) |

### Spartan UI Concepts

Components have two API layers:

- **Brain** — headless, logic-only primitives (e.g., `BrnDialogTriggerDirective`). Attribute selectors like `[brnDialogTrigger]`.
- **Helm** — styled wrappers using `hostDirectives` to compose Brain (e.g., `HlmButtonDirective`). Mixed selectors: `[hlmBtn]`, `hlm-dialog-content`, `[hlmCard],hlm-card`.

Some Helm components wrap `@angular/cdk` directly instead of Brain (DropdownMenu, ContextMenu, Menubar).

**Blocks** are page-level building blocks — complete Angular components combining multiple Spartan UI components.

## Environment Variables

- `GITHUB_TOKEN` — GitHub PAT for 5000 req/hr (default: 60/hr unauthenticated)
- `SPARTAN_CACHE_TTL_HOURS` — File cache TTL in hours (default: 24)
- `SPARTAN_CACHE_TTL_MS` — In-memory cache TTL in ms (default: 300000)
- `SPARTAN_FETCH_TIMEOUT_MS` — HTTP timeout in ms (default: 15000)

## Adding New Components

When Spartan releases new components:
1. Run `npm run generate-registry` to fetch from the live Analog API
2. The registry.json is updated automatically
3. Rebuild with `npm run build`

Users can also call `spartan_registry_refresh` at runtime to pick up new components without updating the MCP.
