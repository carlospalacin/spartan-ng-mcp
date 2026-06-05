## Why

The published package ships `src/registry/registry.json` (it is listed in `files`) as the
offline **floor** — the data a fresh install or an offline user starts from. Today that file
is only refreshed by running `npm run generate-registry` by hand and then the fully manual,
interactive `scripts/publish.sh`. Between releases the committed snapshot rots, and there is
**no CI at all** (`.github/workflows/` does not exist).

This change adds the **build-time** complement to `registry-disk-ttl-refresh`: where the
runtime SWR keeps an *installed, running* user fresh on their own machine, this keeps the
*published floor* current and gives maintainers **visibility** into upstream Spartan drift as
reviewable pull requests — and, on approval, ships it.

## What Changes

- **New `.github/workflows/registry-regen.yml`** — runs on a **weekly** cron plus
  `workflow_dispatch`. Installs with pnpm (frozen lockfile), runs `generate-registry`,
  performs **meaningful-drift detection** (ignoring the always-changing `generatedAt`), and
  when components/blocks/docs actually changed, **opens/updates a single PR** (stable branch,
  labelled) so the maintainer is notified, reviews, and merges. It never commits to `main`
  directly.
- **New `.github/workflows/release.yml`** — triggers when the merged registry change lands on
  `main` (push filtered to `src/registry/registry.json`). It bumps the **minor** version,
  builds explicitly (`generate-registry` + `tsc`), **publishes to npm via OIDC trusted
  publishing** (no long-lived `NPM_TOKEN`, with provenance), then creates the git tag and a
  **GitHub Release**.
- **Loop prevention** so the release job's own version-bump commit does not re-trigger a
  release.
- **DECIDED:** PR-gated (human reviews + merges) → merge triggers **minor** bump + GitHub
  Release + OIDC publish; weekly cadence; only when there is real drift.

## Non-goals

- No change to `generate-registry.ts` logic or to `registry.json` shape/contents (only
  running it).
- No `spartanImports` block backfill (separate deferred change).
- No change to the runtime SWR mechanism (`registry-disk-ttl-refresh`).
- This lane is **only** for registry-data refreshes; the manual `publish.sh` remains for
  code/feature releases. The two lanes must not collide (see design).

## Capabilities

### New Capabilities
- `scheduled-registry-regeneration`: CI that periodically regenerates the committed registry,
  detects meaningful drift, surfaces it as a reviewable PR, and on merge cuts a minor,
  provenance-signed npm release plus a GitHub Release.

### Modified Capabilities
<!-- None. -->

## Impact

- **New files**: `.github/workflows/registry-regen.yml`, `.github/workflows/release.yml`, and
  (optionally) a tiny normalize/diff helper invoked by the regen job.
- **External config**: configure the npm package's **trusted publisher** (OIDC: GitHub
  Actions, this repo, the release workflow) on npmjs; fallback granular automation
  `NPM_TOKEN` only if OIDC is unavailable.
- **Repo settings**: Actions must be allowed to open PRs; workflow permissions
  `contents: write`, `pull-requests: write`, `id-token: write`. Branch protection on `main`
  may block the bot's version-bump push — flagged as an open question in design.
- **Behavior/tradeoffs**: version churn (a **minor** per accepted refresh); a second release
  lane alongside `publish.sh`; consumers receive the fresh floor only after the PR is merged
  (live freshness for installed users is already covered by the runtime SWR change).
