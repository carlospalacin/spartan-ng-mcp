# spartan-ng-mcp

An MCP (Model Context Protocol) server that exposes the **Spartan Angular UI** ecosystem as intelligent tools for AI-powered IDEs and assistants. Discover components, browse Brain/Helm APIs, fetch source code, generate install commands, detect project context, and use page-level building blocks — all through the MCP protocol.

## Why

Spartan's dual-layer architecture (Brain for headless logic + Helm for styled components) is powerful but has a learning curve. AI assistants need structured access to component APIs, source code, and installation patterns to generate correct Angular code. This MCP server bridges that gap — turning the entire Spartan ecosystem into a queryable, context-aware tool surface.

## Features

- **56 components** with full Brain/Helm API details (directives, inputs, outputs, signal models)
- **17 page-level blocks** (sidebar, login, signup, calendar variants)
- **Fuzzy search** across components, blocks, and documentation
- **TypeScript source code** fetching from GitHub with intelligent caching
- **Project context detection** — Angular version, Nx workspace, Tailwind config, zoneless mode
- **Installation command generation** — `nx generate` or `npm install` with peer dependency resolution
- **Post-install audit** — verification checklist for Tailwind preset, Brain/Helm pairing, OnPush
- **Runtime registry refresh** — pick up new Spartan components without an MCP update
- **Skills installer** — deploy [spartan-ng-skills](https://github.com/jcpalaci/spartan-ng-skills) to any Angular project

## Quick Start

### 1. Install & Build

```bash
git clone https://github.com/jcpalaci/spartan-ng-mcp.git
cd spartan-ng-mcp
npm install
npm run build
```

### 2. Configure Your IDE

#### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "spartan-ng": {
      "command": "node",
      "args": ["/absolute/path/to/spartan-ng-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "spartan-ng": {
      "command": "node",
      "args": ["/absolute/path/to/spartan-ng-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

#### VS Code (Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "spartan-ng": {
      "command": "node",
      "args": ["/absolute/path/to/spartan-ng-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

> **Note:** The `GITHUB_TOKEN` is optional but recommended. Without it, GitHub API requests are limited to 60/hr. With a token (no scopes needed — public repo access only), the limit is 5000/hr. You can also pass `SPARTAN_CACHE_TTL_HOURS` and other config variables in the `env` block.

## Tools

### Discovery

| Tool | Description |
|------|-------------|
| `spartan_list` | List all components and blocks. Filter by type or block category. |
| `spartan_search` | Fuzzy search across components, blocks, and docs. Ranked results with scores. |
| `spartan_view` | Detailed component view: Brain directives, Helm components, inputs/outputs, examples, install snippets. |
| `spartan_dependencies` | Component dependency graph with direct, transitive, and reverse dependencies. |

### Source Code

| Tool | Description |
|------|-------------|
| `spartan_source` | Fetch Brain/Helm TypeScript source code from GitHub. |
| `spartan_block_source` | Fetch block source code with shared utilities and extracted imports. |

### Documentation

| Tool | Description |
|------|-------------|
| `spartan_docs` | Fetch documentation topics: installation, CLI, theming, dark-mode, typography, figma, changelog. |

### Installation

| Tool | Description |
|------|-------------|
| `spartan_install_command` | Generate `nx generate @spartan-ng/cli:ui` or `npm install` commands. Auto-detects package manager. |
| `spartan_audit` | Post-installation checklist: Angular project, Tailwind, Spartan preset, Brain/Helm pairing, OnPush. |
| `spartan_install_skills` | Install [spartan-ng-skills](https://github.com/jcpalaci/spartan-ng-skills) into a project's `.claude/skills/spartan/` directory. |

### Project Context

| Tool | Description |
|------|-------------|
| `spartan_project_info` | Detect Angular/Nx config, Tailwind version, installed packages, package manager, zoneless mode. |
| `spartan_project_components` | List installed Brain/Helm packages with missing pair detection. |

### Cache & Registry

| Tool | Description |
|------|-------------|
| `spartan_cache` | Cache status, clear, or rebuild. Shows memory + file stats and GitHub rate limit. |
| `spartan_registry_refresh` | Refresh registry from live Spartan Analog API. Reports added/updated/removed components. |

## Resources

MCP resources provide direct data access via the `spartan://` URI scheme:

| URI | Description |
|-----|-------------|
| `spartan://components/list` | All components with Brain/Helm availability |
| `spartan://blocks/list` | All blocks grouped by category |
| `spartan://project/info` | Registry metadata |
| `spartan://component/{name}/api` | Brain & Helm API specs for a component |
| `spartan://component/{name}/examples` | Code examples for a component |

## Prompts

Pre-built workflow templates for common tasks:

| Prompt | Description |
|--------|-------------|
| `spartan-get-started` | Installation + API overview + basic usage for any component |
| `spartan-compare-layers` | Side-by-side Brain vs Helm API comparison |
| `spartan-implement` | Step-by-step feature implementation guide |
| `spartan-use-block` | Block integration guide with source fetching |
| `spartan-migrate` | Version migration guide with Nx generators |

## Architecture

```
src/
├── index.ts                  # Entry point — stdio transport
├── server.ts                 # McpServer factory + tool registration
├── tools/                    # 14 MCP tools (one file per group)
│   ├── discovery.ts          # list, search, view, dependencies
│   ├── source.ts             # component + block source
│   ├── docs.ts               # documentation topics
│   ├── install.ts            # CLI commands + audit
│   ├── context.ts            # project detection
│   ├── cache.ts              # cache + registry refresh
│   ├── dependencies.ts       # dependency graph
│   └── skills.ts             # skills installer
├── data/                     # API clients
│   ├── analog-api.ts         # Spartan Analog API (primary data source)
│   ├── github.ts             # GitHub API (source code)
│   └── types.ts              # Shared TypeScript types
├── registry/                 # Hybrid component registry
│   ├── registry.ts           # Loader + search + runtime refresh
│   ├── schema.ts             # Zod validation schemas
│   └── registry.json         # Static registry (56 components, 17 blocks)
├── cache/                    # Multi-layer caching
│   ├── memory-cache.ts       # LRU with TTL (5 min)
│   ├── file-cache.ts         # Versioned file cache (24h)
│   └── cache-manager.ts      # Orchestrator: memory → file → network
├── project/                  # Project scanner
│   ├── detector.ts           # Angular/Nx/Tailwind/zoneless detection
│   └── types.ts              # SpartanProjectContext type
├── search/fuzzy.ts           # fuzzysort wrapper
├── errors/errors.ts          # SpartanError + 17 error codes
├── resources/spartan.ts      # spartan:// URI handlers
├── prompts/workflows.ts      # 5 workflow templates
└── utils/                    # Pure utilities
    ├── constants.ts           # URLs, timeouts, allowed hosts
    ├── fetch.ts               # HTTP client with SSRF protection
    ├── html.ts                # HTML parsing + extraction
    └── imports.ts             # TypeScript import/export extraction
```

### Data Resolution (3-tier)

```
Discovery (list, search)    →  Static Registry (instant, offline)
Details (view, examples)    →  Memory Cache → File Cache → Analog API
Source code (source, block) →  Memory Cache → File Cache → GitHub API
```

1. **Static Registry** (`registry.json`) — committed per release, zero latency
2. **Analog API** — structured JSON from spartan.ng, cached 30min (memory) + 24h (file)
3. **GitHub API** — TypeScript source code, cached 24h, rate-limited

### Spartan UI Concepts

Components have two API layers:

- **Brain** — headless, logic-only primitives. Attribute selectors like `[brnDialogTrigger]`. Provides ARIA, keyboard handling, and focus management.
- **Helm** — styled wrappers using `hostDirectives` to compose Brain. Mixed selectors: `[hlmBtn]`, `hlm-dialog-content`, `[hlmCard],hlm-card`. Uses CVA (Class Variance Authority) for variants and Tailwind for styling.

Some Helm components wrap `@angular/cdk` directly instead of Brain (DropdownMenu, ContextMenu, Menubar).

**Blocks** are page-level building blocks — complete Angular components combining multiple Spartan components (sidebar layouts, login forms, calendar views).

## Skills

This MCP server is designed to work alongside [spartan-ng-skills](https://github.com/jcpalaci/spartan-ng-skills) — Claude Code skills that teach AI assistants how to correctly compose Spartan components.

**MCP** provides the knowledge: what components exist, their APIs, source code.
**Skills** provide the wisdom: how to use them correctly, composition rules, styling conventions.

Install skills into any project:

```
# Via MCP tool
spartan_install_skills(cwd="/path/to/your-angular-project")

# Or manually
cp -r /path/to/spartan-ng-skills/.claude /path/to/your-angular-project/
```

The skills include 6 rule files with correct/incorrect Angular code pairs covering:
- Brain vs Helm selection and `hostDirectives`
- Component composition (Dialog, Card, Tabs, forms)
- Styling with `hlm()`, `classes()`, CVA variants, semantic tokens
- Angular Reactive Forms with HlmField system
- Icon patterns with `ng-icon`
- Angular directives: signals, `@if`/`@for`, `inject()`, OnPush

## Configuration

All settings are passed via the `env` block in your MCP configuration file (`.mcp.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "spartan-ng": {
      "command": "node",
      "args": ["/path/to/spartan-ng-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_...",
        "SPARTAN_CACHE_TTL_HOURS": "48"
      }
    }
  }
}
```

### Available Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | — | GitHub PAT for 5000 req/hr (60/hr without). No scopes required. |
| `SPARTAN_CACHE_TTL_HOURS` | `24` | File cache TTL in hours |
| `SPARTAN_CACHE_TTL_MS` | `300000` | In-memory cache TTL in ms (5 min) |
| `SPARTAN_FETCH_TIMEOUT_MS` | `15000` | HTTP fetch timeout in ms |

### Updating the Registry

When Spartan releases new components:

```bash
# Regenerate from live Analog API
npm run generate-registry

# Rebuild
npm run build
```

Or at runtime without rebuilding:

```
spartan_registry_refresh(force=true)
```

## Development

```bash
npm run dev          # TypeScript watch mode
npm run typecheck    # Type-check without emitting
npm run build        # Compile to dist/
npm test             # Run tests
npm run lint         # ESLint
```

## License

MIT
