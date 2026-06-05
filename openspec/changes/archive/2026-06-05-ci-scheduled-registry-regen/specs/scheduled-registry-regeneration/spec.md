## ADDED Requirements

### Requirement: Scheduled registry regeneration in CI
The system SHALL provide a CI workflow that runs `generate-registry` on a weekly schedule and
on manual `workflow_dispatch`, installing dependencies with pnpm and a frozen lockfile.

#### Scenario: Weekly cron run
- **WHEN** the weekly cron fires on the default branch
- **THEN** the workflow checks out `main`, installs with `pnpm --frozen-lockfile`, and runs `generate-registry`

#### Scenario: Manual dispatch
- **WHEN** a maintainer triggers the workflow via `workflow_dispatch`
- **THEN** the same regeneration runs on demand

### Requirement: Meaningful-drift detection ignores generatedAt
The system SHALL detect registry drift by comparing only meaningful content
(components/blocks/docs) and SHALL ignore the always-changing `generatedAt` (and `version`)
fields so that an unchanged registry does not register as drift.

#### Scenario: Only timestamp changed
- **WHEN** regeneration changes only `generatedAt`
- **THEN** no drift is reported and no pull request is opened

#### Scenario: Component data changed
- **WHEN** regeneration adds, removes, or updates a component, block, or doc
- **THEN** drift is reported

### Requirement: Drift surfaces as a reviewable pull request
The system SHALL, when meaningful drift is detected, open or update a single pull request on a
stable branch with the regenerated `registry.json`, and SHALL NOT commit the change directly
to `main`.

#### Scenario: PR opened on drift
- **WHEN** drift is detected and no open refresh PR exists
- **THEN** a labelled pull request is opened with the regenerated registry

#### Scenario: Existing PR updated, not duplicated
- **WHEN** drift is detected and a refresh PR is already open
- **THEN** the same PR/branch is updated instead of opening a duplicate

#### Scenario: No drift
- **WHEN** no meaningful drift is detected
- **THEN** no pull request is opened or updated

### Requirement: Merge triggers a minor release
The system SHALL, when a registry-refresh PR is merged to `main` (a push affecting
`src/registry/registry.json`), bump the package **minor** version, build explicitly, and run
the release.

#### Scenario: Merge cuts a release
- **WHEN** the refresh PR is merged to `main`
- **THEN** the release workflow runs, bumping the minor version and building before publish

#### Scenario: Build runs before publish
- **WHEN** the release workflow prepares to publish
- **THEN** it runs `generate-registry` and `tsc` first (lifecycle hooks do not build)

### Requirement: Provenance-signed publish without long-lived credentials
The system SHALL publish to npm using OIDC trusted publishing with provenance and SHALL NOT
require a long-lived `NPM_TOKEN` secret in the default path.

#### Scenario: OIDC publish
- **WHEN** the release workflow publishes
- **THEN** it authenticates via OIDC (`id-token: write`) and publishes with provenance

### Requirement: Tag and GitHub Release created
The system SHALL create a git tag and a GitHub Release for the published version, ordered
after a successful npm publish so a failed publish leaves no dangling tag or release.

#### Scenario: Release artifacts after publish
- **WHEN** the npm publish succeeds
- **THEN** a `vX.Y.Z` tag and a corresponding GitHub Release are created

#### Scenario: Failed publish leaves no release
- **WHEN** the npm publish fails
- **THEN** no tag and no GitHub Release are created

### Requirement: Publish loop prevention
The system SHALL ensure the release job's own version-bump commit does not re-trigger the
release workflow.

#### Scenario: Bump commit does not recurse
- **WHEN** the release job pushes its version-bump commit to `main`
- **THEN** the release workflow is not triggered again by that commit
