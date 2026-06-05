## Context

There is no CI today (`.github/workflows/` is absent). Releases are fully manual via
`scripts/publish.sh`: interactive bump select → `pnpm version` → commit `vX.Y.Z` → tag →
`pnpm publish`. The package uses **pnpm** with `pnpm-lock.yaml` (no `packageManager` pin).

`scripts/generate-registry.ts` fetches **only** the Spartan Analog API (no GitHub, no token),
writes `src/registry/registry.json` with `version: pkg.version`, `generatedAt:
new Date().toISOString()`, and `spartanVersion: 'latest'`. The package ships that file in
`files`, so it is the offline floor for consumers.

Important build fact: npm/pnpm publish **lifecycle hooks do not build here** — `prepare` only
runs husky, and `prerelease` (`generate-registry && build`) is a *custom, non-lifecycle*
script. CI must build explicitly before publishing.

This change is the build-time complement to `registry-disk-ttl-refresh` (runtime SWR).

## Goals / Non-Goals

**Goals:**
- Keep the committed/published registry floor fresh without manual `generate-registry` runs.
- Surface upstream Spartan drift as a reviewable PR (maintainer notified → review → merge).
- On merge, cut a minor, provenance-signed npm release + GitHub Release, hands-off.
- Run entirely on GitHub-hosted infrastructure (cron + ephemeral runners); no server to own.

**Non-Goals:**
- Editing `generate-registry.ts` or the registry shape.
- `spartanImports` backfill (separate change).
- Replacing `publish.sh` for code/feature releases.
- Auto-merging the PR (a human always reviews registry data before it ships).

## Decisions

### D1 — Two-workflow split: regen→PR, then merge→release
`registry-regen.yml` (cron) opens a PR; `release.yml` runs on push to `main` touching
`src/registry/registry.json` (i.e., the merged PR) and publishes.
- *Why:* keeps the human review gate the user chose; the loop closes only on approval.
- *Alternative:* one cron that publishes directly (rejected — unreviewed data to npm).

### D2 — Meaningful-drift detection (ignore `generatedAt`)
`generate-registry` stamps a fresh `generatedAt` every run, so a naive `git diff` is **always**
dirty. The regen job normalizes both sides (strip/zero `generatedAt`, and `version`) and only
opens a PR when `components`/`blocks`/`docs` actually differ. The committed file still carries
the new `generatedAt`.
- *Why:* prevents weekly no-op PRs.
- *Alternative:* make the generator preserve `generatedAt` when unchanged (rejected — touches
  the generator, a non-goal). Implementation: a small `node`/`tsx` compare step or
  `jq`-normalized hash.

### D3 — OIDC trusted publishing, not a long-lived token
Publish with `permissions: id-token: write` and `pnpm publish --provenance` against npm's
trusted-publisher (OIDC) configuration for this repo+workflow. No `NPM_TOKEN` secret.
- *Why:* eliminates a long-lived publish credential and adds npm provenance/attestation.
- *Fallback:* a granular **automation** `NPM_TOKEN` secret only if OIDC cannot be configured.

### D4 — Minor version bump for registry-only releases
`pnpm version minor --no-git-tag-version`, then commit + tag.
- *Rationale:* a registry refresh usually means new components became available — a
  backwards-compatible *addition*, which maps to a SemVer **minor**. Releases cut by this lane
  are documented as "registry refresh" so they read distinctly from feature releases.
- *Trade-off:* faster minor churn than patch; accepted per decision.

### D5 — Publish-loop prevention
The release job pushes a version-bump commit to `main`; that push must not re-trigger
`release.yml`. Guard via a `paths:` filter on `src/registry/registry.json` **plus** skipping
when the head commit is the release bot's own bump (commit-message marker / actor check), or
`paths-ignore: package.json`.
- *Why:* avoid an infinite publish loop.

### D6 — Explicit build before publish
The release job runs `pnpm run generate-registry && pnpm run build` (the `prerelease` steps)
before `pnpm publish`, because lifecycle hooks do not build (see Context). Ordering: install →
build → **publish** → tag → GitHub Release, so a failed publish leaves no dangling tag/release.

### D7 — pnpm + frozen lockfile, pinned version
Use `pnpm/action-setup` with a pinned pnpm version (no `packageManager` field to infer from)
and `pnpm install --frozen-lockfile` to match the `pnpm-lock.yaml` that `publish.sh` relies on.

### D8 — Stable PR branch, updated in place
The regen PR targets a fixed branch (e.g. `chore/registry-refresh`) via
`peter-evans/create-pull-request` (or `gh`), so successive weekly runs update one PR instead
of stacking duplicates. Labelled `registry-refresh`.

### D9 — GitHub Release with a diff summary
Create the release with `gh release create` (or `softprops/action-gh-release`); notes
summarize added/removed/updated components derived from the registry diff.

## Risks / Trade-offs

- **`generatedAt` churn → false drift** → mitigated by D2 normalization.
- **Infinite publish loop** from the bump commit → D5 guard.
- **Two release lanes collide** (manual `publish.sh` + CI) → version race / double publish.
  *Mitigation:* CI bumps from current `package.json`; if `npm view` shows the version already
  published, abort; document that registry-refresh releases go only through the CI lane.
- **Branch protection blocks the bot's bump push** → if `main` requires PRs/checks, the
  release job cannot push the version commit with the default `GITHUB_TOKEN`. *Mitigation:* a
  GitHub App token / fine-grained PAT with bypass, or move the bump into the PR itself. **Open
  question.**
- **`GITHUB_TOKEN`-opened PR does not trigger downstream workflows** → fine here: the human
  *merge* is a real push event and triggers `release.yml`.
- **Scheduled workflow auto-disabled after 60 days of repo inactivity** → mitigated because
  merges/releases are activity; `workflow_dispatch` also re-arms it.
- **OIDC misconfiguration → publish fails** → publish is ordered before tag/release (D6), so a
  failure aborts cleanly with no partial release.
- **Permissions scope** → `contents: write` (commit/tag/release), `pull-requests: write` (PR),
  `id-token: write` (OIDC).

## Migration Plan

Purely additive: add the two workflow files and configure the npm trusted publisher. No data
migration. **Rollback:** delete the workflows (or remove the `schedule:` trigger to pause);
the manual `publish.sh` flow is untouched and remains the fallback.

## Open Questions

- Configure npm OIDC trusted publishing now, or ship with a granular `NPM_TOKEN` first and
  migrate to OIDC later?
- Is `main` branch-protected such that the release job needs an App token to push the bump? If
  so, prefer carrying the version bump inside the regen PR instead of a post-merge commit.
- Should release notes auto-derive the component diff (added/removed), or stay a static
  "registry refresh" message initially?
- Weekly cron day/time (UTC) — default proposed: Mondays 06:00 UTC.
