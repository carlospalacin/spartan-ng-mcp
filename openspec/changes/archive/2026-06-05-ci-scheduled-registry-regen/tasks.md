## 1. Regeneration workflow (cron → PR)

- [x] 1.1 Create `.github/workflows/registry-regen.yml` with `on: schedule` (weekly, Mon 06:00 UTC) and `workflow_dispatch`
- [x] 1.2 Steps: checkout `main`, `pnpm/action-setup` (pinned version), setup-node, `pnpm install --frozen-lockfile`
- [x] 1.3 Run `pnpm run generate-registry`
- [x] 1.4 Add meaningful-drift detection that ignores `generatedAt`/`version` (`scripts/check-registry-drift.mjs`)
- [x] 1.5 On drift, open/update a single PR on a stable branch (`chore/registry-refresh`) via `peter-evans/create-pull-request`, labelled `registry-refresh`
- [x] 1.6 On no drift, exit cleanly (revert the working-tree timestamp change)
- [x] 1.7 Set workflow `permissions: contents: write, pull-requests: write`

## 2. Release workflow (merge → publish)

- [x] 2.1 Create `.github/workflows/release.yml` with `on: push: branches: [main], paths: ['src/registry/registry.json']`
- [x] 2.2 Loop guard: `[skip ci]` in the bump commit + job-level `if:` skipping `chore(release):` head commits
- [x] 2.3 Steps: checkout, pnpm setup, `pnpm install --frozen-lockfile`
- [x] 2.4 `pnpm version minor --no-git-tag-version`; commit the bump
- [x] 2.5 Build with `tsc` only (`pnpm run build`) — DEVIATION: do NOT re-run `generate-registry` (re-fetching would publish unreviewed data); stamp `registry.json` version to match the bump instead
- [x] 2.6 Publish via `npm publish` + OIDC trusted publishing — DEVIATION: provenance is automatic (no `--provenance` flag), needs Node ≥ 22.14 / npm ≥ 11.5.1, no `NPM_TOKEN`; `permissions: id-token: write`
- [x] 2.7 After successful publish: push the bump commit, create `vX.Y.Z` tag, create the GitHub Release
- [x] 2.8 Abort publish if `npm view <pkg>@<version>` already exists (guards against the manual `publish.sh` lane collision)

## 3. npm OIDC / publish configuration

- [x] 3.1 Configure the package's trusted publisher on npmjs (GitHub Actions, this repo, `release.yml`) — done by operator (2026-06-05)
- [x] 3.2 Document the OIDC setup in the repo (`RELEASING.md`); note the `NPM_TOKEN` fallback path if OIDC is unavailable

## 4. Repo settings & guards

- [x] 4.1 "Allow GitHub Actions to create and approve pull requests" enabled by operator (confirmed working — PR #1 opened successfully)
- [x] 4.2 Branch-protection interaction resolved — `main` is NOT protected (verified via `gh api`), so the bump push uses the default `GITHUB_TOKEN`; no App token needed (documented in `RELEASING.md`)
- [x] 4.3 Scheduled-workflow auto-disable mitigation confirmed — merges/releases/`workflow_dispatch` all count as activity (documented in `RELEASING.md`)

## 5. Verification (requires a GitHub run — cannot execute locally)

- [x] 5.1 `workflow_dispatch` dry-run succeeded on GitHub (run 27013174786); drift script verified locally for the generatedAt-only no-PR case
- [x] 5.2 Live dry-run opened a single labelled PR (#1) on `chore/registry-refresh` on real drift (3 Brn*Wrapper directives removed upstream); update-in-place is the create-pull-request stable-branch behavior
- [x] 5.3 Merged PR #1 → release run 27013964454: minor bump 2.0.5→2.1.0, OIDC publish WITH provenance attestations, tag + GitHub Release v2.1.0, exactly 1 release run (no loop)
- [x] 5.4 Ordering verified by inspection — publish precedes tag/release in `release.yml`; a failed publish exits before any tag/release is created (not exercised live, would require forcing a publish failure)
