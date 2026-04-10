import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SpartanProjectContext } from './types.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

function detectPackageManager(rootDir: string): Promise<SpartanProjectContext['packageManager']> {
  return (async () => {
    if (await fileExists(join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await fileExists(join(rootDir, 'yarn.lock'))) return 'yarn';
    if (await fileExists(join(rootDir, 'bun.lockb'))) return 'bun';
    return 'npm';
  })();
}

export async function detectProject(cwd?: string): Promise<SpartanProjectContext> {
  const rootDir = cwd ?? process.cwd();

  // Read package.json
  const pkg = await readJsonSafe(join(rootDir, 'package.json'));
  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  };

  // Angular detection
  const angularVersion = deps['@angular/core']
    ? String(deps['@angular/core']).replace(/^[\^~]/, '')
    : null;

  // Nx detection
  const nxJson = await readJsonSafe(join(rootDir, 'nx.json'));
  const isNxWorkspace = nxJson !== null || (await fileExists(join(rootDir, 'project.json')));
  const nxVersion = deps['nx'] ? String(deps['nx']).replace(/^[\^~]/, '') : null;

  // Project type
  const angularJson = await readJsonSafe(join(rootDir, 'angular.json'));
  let projectType: SpartanProjectContext['projectType'] = null;
  if (angularJson) {
    const projects = angularJson.projects as Record<string, Record<string, unknown>> | undefined;
    if (projects) {
      const firstProject = Object.values(projects)[0];
      const pt = firstProject?.projectType;
      if (pt === 'application' || pt === 'library') {
        projectType = pt;
      }
    }
  }

  // Zoneless detection
  let isZoneless = false;
  const appConfigPaths = [
    join(rootDir, 'src/app/app.config.ts'),
    join(rootDir, 'app/app.config.ts'),
  ];
  for (const configPath of appConfigPaths) {
    const content = await readFileSafe(configPath);
    if (content?.includes('provideZonelessChangeDetection')) {
      isZoneless = true;
      break;
    }
  }

  // Spartan packages
  const { brainPackages, helmPackages } = await scanSpartanPackages(rootDir, deps);

  // Missing pairs
  const brainNames = new Set(brainPackages.map(extractComponentName));
  const helmNames = new Set(helmPackages.map(extractComponentName));
  const brainWithoutHelm = [...brainNames].filter(
    (n) => !helmNames.has(n) && n !== 'core' && n !== 'forms',
  );
  const helmWithoutBrain = [...helmNames].filter((n) => !brainNames.has(n) && n !== 'utils');

  // Tailwind detection
  let tailwindVersion: SpartanProjectContext['tailwindVersion'] = null;
  let tailwindConfigPath: string | null = null;
  let hasSpartanPreset = false;

  for (const configFile of [
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
  ]) {
    const path = join(rootDir, configFile);
    const content = await readFileSafe(path);
    if (content) {
      tailwindVersion = 'v3';
      tailwindConfigPath = configFile;
      if (content.includes('hlm-tailwind-preset') || content.includes('@spartan-ng')) {
        hasSpartanPreset = true;
      }
      break;
    }
  }

  // Tailwind v4 detection (CSS-based)
  if (!tailwindConfigPath) {
    const cssPaths = [
      join(rootDir, 'src/styles.css'),
      join(rootDir, 'src/styles.scss'),
      join(rootDir, 'src/global.css'),
    ];
    for (const cssPath of cssPaths) {
      const content = await readFileSafe(cssPath);
      if (content?.includes('@import') && content.includes('tailwindcss')) {
        tailwindVersion = 'v4';
        if (content.includes('hlm-tailwind-preset') || content.includes('@spartan-ng')) {
          hasSpartanPreset = true;
        }
        break;
      }
    }
  }

  // Also check deps for tailwind version
  if (!tailwindVersion && deps['tailwindcss']) {
    const twVer = String(deps['tailwindcss']);
    tailwindVersion = twVer.startsWith('4') || twVer.startsWith('^4') ? 'v4' : 'v3';
  }

  // Package manager
  const packageManager = await detectPackageManager(rootDir);

  // src directory
  const srcDir = await fileExists(join(rootDir, 'src'));

  return {
    angularVersion,
    isNxWorkspace,
    nxVersion,
    projectType,
    isZoneless,
    installedBrainPackages: brainPackages,
    installedHelmPackages: helmPackages,
    missingPairs: { brainWithoutHelm, helmWithoutBrain },
    tailwindVersion,
    tailwindConfigPath,
    hasSpartanPreset,
    packageManager,
    srcDir,
    rootDir,
  };
}

async function scanSpartanPackages(
  rootDir: string,
  deps: Record<string, string>,
): Promise<{ brainPackages: string[]; helmPackages: string[] }> {
  const brainPackages: string[] = [];
  const helmPackages: string[] = [];

  // From package.json dependencies
  for (const dep of Object.keys(deps)) {
    if (dep.startsWith('@spartan-ng/brain')) {
      brainPackages.push(dep);
    } else if (dep.startsWith('@spartan-ng/helm')) {
      helmPackages.push(dep);
    }
  }

  // Also scan node_modules for secondary entrypoints
  if (brainPackages.length === 0 && helmPackages.length === 0) {
    try {
      const brainDir = join(rootDir, 'node_modules/@spartan-ng/brain');
      if (await fileExists(brainDir)) {
        const entries = await readdir(brainDir);
        for (const entry of entries) {
          if (!entry.startsWith('.') && !entry.startsWith('_')) {
            const pkgPath = join(brainDir, entry, 'package.json');
            if (await fileExists(pkgPath)) {
              brainPackages.push(`@spartan-ng/brain/${entry}`);
            }
          }
        }
      }
    } catch {
      // Not installed
    }

    try {
      const helmDir = join(rootDir, 'node_modules/@spartan-ng/helm');
      if (await fileExists(helmDir)) {
        const entries = await readdir(helmDir);
        for (const entry of entries) {
          if (!entry.startsWith('.') && !entry.startsWith('_')) {
            const pkgPath = join(helmDir, entry, 'package.json');
            if (await fileExists(pkgPath)) {
              helmPackages.push(`@spartan-ng/helm/${entry}`);
            }
          }
        }
      }
    } catch {
      // Not installed
    }
  }

  return { brainPackages: brainPackages.sort(), helmPackages: helmPackages.sort() };
}

function extractComponentName(pkg: string): string {
  // @spartan-ng/brain/dialog -> dialog
  // @spartan-ng/brain -> brain (root)
  const parts = pkg.split('/');
  return parts[2] ?? parts[1] ?? pkg;
}
