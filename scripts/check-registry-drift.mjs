#!/usr/bin/env node

/**
 * Meaningful-drift detection for the committed registry.
 *
 * `generate-registry` stamps a fresh `generatedAt` on every run, so a naive
 * `git diff` is ALWAYS dirty. This compares the freshly generated working-tree
 * registry against the committed (HEAD) version while IGNORING `generatedAt` and
 * `version`, so a PR is only opened when components/blocks/docs actually changed.
 *
 * Output: prints a human-readable line and writes `drifted=true|false` to
 * `$GITHUB_OUTPUT` (when running under GitHub Actions). Exit code is always 0;
 * read the `drifted` output, not the exit code.
 *
 * Usage: node scripts/check-registry-drift.mjs
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_REL = 'src/registry/registry.json';
const REGISTRY_ABS = join(PROJECT_ROOT, REGISTRY_REL);

/** Recursively sort object keys so comparison is order-independent. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Strip volatile fields that change on every generation. */
function meaningful(registry) {
  const { generatedAt: _generatedAt, version: _version, ...rest } = registry;
  return JSON.stringify(canonicalize(rest));
}

function readWorkingTree() {
  return JSON.parse(readFileSync(REGISTRY_ABS, 'utf-8'));
}

function readCommitted() {
  try {
    // Fixed args, no shell — `git show HEAD:<constant path>`.
    const raw = execFileSync('git', ['show', `HEAD:${REGISTRY_REL}`], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(raw);
  } catch {
    // No committed registry (first run) → treat as drifted.
    return null;
  }
}

function main() {
  const committed = readCommitted();
  const current = readWorkingTree();

  const drifted = committed === null || meaningful(committed) !== meaningful(current);

  console.log(
    drifted
      ? 'Meaningful registry drift detected — a refresh PR should be opened.'
      : 'No meaningful registry drift (only generatedAt changed).',
  );

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `drifted=${drifted}\n`);
  }
}

main();
