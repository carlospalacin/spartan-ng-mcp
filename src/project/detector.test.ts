import { mkdir, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpartanError } from '../errors/errors.js';
import { detectProject } from './detector.js';

describe('detectProject', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'spartan-detect-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('throws for nonexistent directory', async () => {
    await expect(detectProject('/nonexistent/path/xyz')).rejects.toThrow(SpartanError);
  });

  it('detects basic project without package.json', async () => {
    const ctx = await detectProject(tempDir);
    expect(ctx.angularVersion).toBeNull();
    expect(ctx.packageManager).toBe('npm'); // default
    expect(ctx.rootDir).toBe(tempDir);
  });

  it('detects Angular version', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        dependencies: { '@angular/core': '^19.0.0' },
      }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.angularVersion).toBe('19.0.0');
  });

  it('detects pnpm package manager', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(join(tempDir, 'pnpm-lock.yaml'), '');
    const ctx = await detectProject(tempDir);
    expect(ctx.packageManager).toBe('pnpm');
  });

  it('detects yarn package manager', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(join(tempDir, 'yarn.lock'), '');
    const ctx = await detectProject(tempDir);
    expect(ctx.packageManager).toBe('yarn');
  });

  it('detects bun package manager', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(join(tempDir, 'bun.lockb'), '');
    const ctx = await detectProject(tempDir);
    expect(ctx.packageManager).toBe('bun');
  });

  it('detects Nx workspace via nx.json', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(join(tempDir, 'nx.json'), '{}');
    const ctx = await detectProject(tempDir);
    expect(ctx.isNxWorkspace).toBe(true);
  });

  it('detects Nx workspace via project.json', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(join(tempDir, 'project.json'), '{}');
    const ctx = await detectProject(tempDir);
    expect(ctx.isNxWorkspace).toBe(true);
  });

  it('detects project type from angular.json', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(
      join(tempDir, 'angular.json'),
      JSON.stringify({ projects: { app: { projectType: 'application' } } }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.projectType).toBe('application');
  });

  it('detects zoneless change detection', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await mkdir(join(tempDir, 'src/app'), { recursive: true });
    await writeFile(
      join(tempDir, 'src/app/app.config.ts'),
      `export const config = { providers: [provideZonelessChangeDetection()] };`,
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.isZoneless).toBe(true);
  });

  it('detects Tailwind v3 config', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(
      join(tempDir, 'tailwind.config.js'),
      `module.exports = { presets: [require('hlm-tailwind-preset')] }`,
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.tailwindVersion).toBe('v3');
    expect(ctx.hasSpartanPreset).toBe(true);
  });

  it('detects Tailwind v4 from CSS', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(
      join(tempDir, 'src/styles.css'),
      `@import 'tailwindcss';\n@plugin 'hlm-tailwind-preset';`,
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.tailwindVersion).toBe('v4');
    expect(ctx.hasSpartanPreset).toBe(true);
  });

  it('detects Tailwind from dependencies', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ devDependencies: { tailwindcss: '^4.0.0' } }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.tailwindVersion).toBe('v4');
  });

  it('detects installed Spartan packages', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@spartan-ng/brain/dialog': '0.0.5',
          '@spartan-ng/helm/dialog': '0.0.5',
          '@spartan-ng/brain/button': '0.0.5',
        },
      }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.installedBrainPackages).toContain('@spartan-ng/brain/dialog');
    expect(ctx.installedBrainPackages).toContain('@spartan-ng/brain/button');
    expect(ctx.installedHelmPackages).toContain('@spartan-ng/helm/dialog');
    expect(ctx.missingPairs.brainWithoutHelm).toContain('button');
  });

  it('detects src directory', async () => {
    await mkdir(join(tempDir, 'src'));
    const ctx = await detectProject(tempDir);
    expect(ctx.srcDir).toBe(true);
  });

  it('uses process.cwd() when no cwd provided', async () => {
    const ctx = await detectProject();
    expect(ctx.rootDir).toBeTruthy();
  });

  it('scans node_modules for spartan packages when not in deps', async () => {
    await writeFile(join(tempDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    // Create fake node_modules/@spartan-ng/brain/dialog
    const brainDir = join(tempDir, 'node_modules/@spartan-ng/brain/dialog');
    await mkdir(brainDir, { recursive: true });
    await writeFile(join(brainDir, 'package.json'), '{}');
    // Create fake node_modules/@spartan-ng/helm/dialog
    const helmDir = join(tempDir, 'node_modules/@spartan-ng/helm/dialog');
    await mkdir(helmDir, { recursive: true });
    await writeFile(join(helmDir, 'package.json'), '{}');

    const ctx = await detectProject(tempDir);
    expect(ctx.installedBrainPackages).toContain('@spartan-ng/brain/dialog');
    expect(ctx.installedHelmPackages).toContain('@spartan-ng/helm/dialog');
  });

  it('ignores hidden dirs in node_modules scan', async () => {
    await writeFile(join(tempDir, 'package.json'), JSON.stringify({ dependencies: {} }));
    const brainDir = join(tempDir, 'node_modules/@spartan-ng/brain/.hidden');
    await mkdir(brainDir, { recursive: true });
    await writeFile(join(brainDir, 'package.json'), '{}');

    const ctx = await detectProject(tempDir);
    expect(ctx.installedBrainPackages).not.toContain('@spartan-ng/brain/.hidden');
  });

  it('handles library project type', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(
      join(tempDir, 'angular.json'),
      JSON.stringify({ projects: { lib: { projectType: 'library' } } }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.projectType).toBe('library');
  });

  it('detects Nx version from deps', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ devDependencies: { nx: '^19.0.0' } }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.nxVersion).toBe('19.0.0');
  });

  it('detects Tailwind v3 from deps', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ devDependencies: { tailwindcss: '3.4.0' } }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.tailwindVersion).toBe('v3');
  });

  it('handles angular.json with unknown project type', async () => {
    await writeFile(join(tempDir, 'package.json'), '{}');
    await writeFile(
      join(tempDir, 'angular.json'),
      JSON.stringify({ projects: { app: { projectType: 'unknown' } } }),
    );
    const ctx = await detectProject(tempDir);
    expect(ctx.projectType).toBeNull();
  });
});
