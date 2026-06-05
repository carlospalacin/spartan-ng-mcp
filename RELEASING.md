# Releasing

This project has **two release lanes**. They must not be used for the same version.

## 1. Automated registry-refresh lane (CI)

Keeps the committed `src/registry/registry.json` floor fresh between manual releases.

```
.github/workflows/registry-regen.yml   weekly cron + manual dispatch
   └─ generate-registry → meaningful-drift check (ignores generatedAt/version)
        └─ drift? → opens/updates the `chore/registry-refresh` PR   ← you review + merge

.github/workflows/release.yml          on push to main touching registry.json (the merged PR)
   └─ bump MINOR → build (tsc) → npm publish (OIDC) → tag + GitHub Release
```

- The release job rebuilds `dist` with `tsc` only — it does **not** re-run
  `generate-registry`, so it publishes exactly the registry data you reviewed in the PR.
- The bump commit is `chore(release): vX.Y.Z [skip ci]`, so it never re-triggers the
  release workflow.

### One-time operator prerequisites

These cannot be done from the repo — do them in the GitHub/npm UIs:

1. **npm trusted publisher (OIDC).** On npmjs.com → the package → *Settings* →
   *Trusted Publisher* → **GitHub Actions**, with:
   - Organization/user: `carlospalacin` (repo owner)
   - Repository: `spartan-ng-mcp`
   - Workflow filename: `release.yml`
   - (Environment: leave blank unless you add one to the workflow.)

   Requirements baked into `release.yml`: Node ≥ 22.14 and npm CLI ≥ 11.5.1 (the
   workflow runs `npm install -g npm@latest`). Provenance is automatic for trusted
   publishing — no `--provenance` flag and **no `NPM_TOKEN` secret** are needed.

   *Fallback if you cannot use OIDC:* create a granular **automation** token on npm,
   store it as the `NPM_TOKEN` repo secret, and change the publish step to
   `npm publish` with `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.

2. **Allow Actions to open PRs.** Repo → *Settings* → *Actions* → *General* →
   *Workflow permissions* → enable **"Allow GitHub Actions to create and approve pull
   requests"** (needed by the regen workflow's PR step).

### Notes

- `main` is currently **not** branch-protected, so the release job pushes the bump
  commit with the default `GITHUB_TOKEN`. If you later protect `main`, either allow the
  Actions bot to bypass, or move the version bump into the regen PR instead of a
  post-merge commit.
- Scheduled workflows are auto-disabled after 60 days of repo **inactivity**. Merges,
  releases, and `workflow_dispatch` all count as activity, so the regular cadence keeps
  the cron armed.

## 2. Manual lane (feature/code releases)

`scripts/publish.sh` — interactive `pnpm version` bump + commit + tag + `pnpm publish`.
Use this for code/feature releases. Do not run it for a version the CI lane is about to
publish (the CI lane aborts if the version already exists on npm, but coordinate to
avoid wasted runs).
