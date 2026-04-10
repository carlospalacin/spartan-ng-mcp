import { z } from 'zod';
import { componentNotFound } from '../errors/errors.js';
import { detectProject } from '../project/detector.js';
import type { RegistryLoader } from '../registry/registry.js';
import type { ToolDefinition } from '../server.js';

export function createInstallTools(registry: RegistryLoader): ToolDefinition[] {
  return [
    {
      name: 'spartan_install_command',
      title: 'Generate Installation Commands',
      description:
        'Generate ready-to-run CLI commands to install Spartan components. Supports Nx generator (recommended) or direct npm install. Returns commands plus required peer dependencies.',
      inputSchema: {
        components: z
          .array(z.string())
          .min(1)
          .describe("Component names to install (e.g. ['dialog', 'button'])"),
        layer: z.enum(['brain', 'helm', 'both']).default('both').describe('Which layer to install'),
        method: z
          .enum(['nx-generator', 'npm-install'])
          .default('nx-generator')
          .describe('Installation method'),
      },
      handler: async (args: { components: string[]; layer?: string; method?: string }) => {
        const layer = args.layer ?? 'both';
        const method = args.method ?? 'nx-generator';

        // Validate all component names
        const validComponents: Array<{
          name: string;
          brainPkg: string;
          helmPkg: string;
          brainAvailable: boolean;
          helmAvailable: boolean;
          peerDependencies: string[];
        }> = [];

        for (const name of args.components) {
          const comp = registry.getComponent(name.trim().toLowerCase());
          if (!comp) throw componentNotFound(name);
          validComponents.push({
            name: comp.name,
            brainPkg: comp.brainPackage,
            helmPkg: comp.helmPackage,
            brainAvailable: comp.brainAvailable,
            helmAvailable: comp.helmAvailable,
            peerDependencies: comp.peerDependencies,
          });
        }

        // Detect project for package manager
        const context = await detectProject();
        const pm = context.packageManager;

        const commands: string[] = [];
        const allPeerDeps = new Set<string>();

        if (method === 'nx-generator') {
          // Nx generator installs both layers
          const names = validComponents.map((c) => c.name).join(',');
          commands.push(`npx nx generate @spartan-ng/cli:ui --name=${names}`);
        } else {
          // npm install individual packages
          const packages: string[] = [];
          for (const comp of validComponents) {
            if ((layer === 'brain' || layer === 'both') && comp.brainAvailable) {
              packages.push(comp.brainPkg);
            }
            if ((layer === 'helm' || layer === 'both') && comp.helmAvailable) {
              packages.push(comp.helmPkg);
            }
          }

          const installCmd =
            pm === 'pnpm'
              ? 'pnpm add'
              : pm === 'yarn'
                ? 'yarn add'
                : pm === 'bun'
                  ? 'bun add'
                  : 'npm install';

          if (packages.length > 0) {
            commands.push(`${installCmd} ${packages.join(' ')}`);
          }
        }

        // Collect peer dependencies
        for (const comp of validComponents) {
          for (const dep of comp.peerDependencies) {
            allPeerDeps.add(dep);
          }
        }

        const result = {
          method,
          layer,
          packageManager: pm,
          commands,
          components: validComponents.map((c) => ({
            name: c.name,
            brain: (layer === 'brain' || layer === 'both') && c.brainAvailable ? c.brainPkg : null,
            helm: (layer === 'helm' || layer === 'both') && c.helmAvailable ? c.helmPkg : null,
          })),
          peerDependencies: [...allPeerDeps].sort(),
          note:
            method === 'nx-generator'
              ? 'The Nx generator handles both Brain and Helm layers, peer dependencies, and Tailwind preset configuration automatically.'
              : 'When installing manually, ensure peer dependencies are installed and the Spartan Tailwind preset is configured.',
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    },
    {
      name: 'spartan_audit',
      title: 'Post-Installation Audit',
      description:
        'Generate a verification checklist after installing Spartan components. Checks imports, peer dependencies, Tailwind preset, Brain/Helm pairing, and common setup issues.',
      inputSchema: {
        components: z.array(z.string()).min(1).describe('Component names to audit'),
      },
      handler: async (args: { components: string[] }) => {
        const context = await detectProject();
        const checks: Array<{
          check: string;
          status: 'pass' | 'warn' | 'info';
          detail: string;
        }> = [];

        // Check Angular project
        checks.push({
          check: 'Angular project detected',
          status: context.angularVersion ? 'pass' : 'warn',
          detail: context.angularVersion
            ? `Angular ${context.angularVersion}`
            : 'No angular.json or @angular/core found. Ensure this is an Angular project.',
        });

        // Check Tailwind
        checks.push({
          check: 'Tailwind CSS configured',
          status: context.tailwindVersion ? 'pass' : 'warn',
          detail: context.tailwindVersion
            ? `Tailwind ${context.tailwindVersion}${context.tailwindConfigPath ? ` (${context.tailwindConfigPath})` : ''}`
            : 'No Tailwind configuration found. Helm components require Tailwind CSS.',
        });

        // Check Spartan preset
        checks.push({
          check: 'Spartan Tailwind preset',
          status: context.hasSpartanPreset ? 'pass' : 'warn',
          detail: context.hasSpartanPreset
            ? 'hlm-tailwind-preset detected in Tailwind config.'
            : "Spartan Tailwind preset not found. Add '@spartan-ng/brain/hlm-tailwind-preset' to your Tailwind configuration for proper theming.",
        });

        // Check each component
        for (const name of args.components) {
          const comp = registry.getComponent(name.trim().toLowerCase());
          if (!comp) {
            checks.push({
              check: `Component: ${name}`,
              status: 'warn',
              detail: `Unknown component "${name}". Check spelling.`,
            });
            continue;
          }

          const hasBrain = context.installedBrainPackages.some(
            (p) => p.includes(`/brain/${comp.name}`) || p === `@spartan-ng/brain`,
          );
          const hasHelm = context.installedHelmPackages.some(
            (p) => p.includes(`/helm/${comp.name}`) || p === `@spartan-ng/helm`,
          );

          if (comp.brainAvailable && comp.helmAvailable) {
            checks.push({
              check: `${comp.name}: Brain/Helm pairing`,
              status: hasBrain && hasHelm ? 'pass' : hasBrain || hasHelm ? 'warn' : 'info',
              detail:
                hasBrain && hasHelm
                  ? `Both ${comp.brainPackage} and ${comp.helmPackage} installed.`
                  : hasBrain
                    ? `Only Brain installed. Install Helm for styled components: ${comp.helmPackage}`
                    : hasHelm
                      ? `Only Helm installed. Brain is included as peer dependency.`
                      : `Not detected in node_modules. Run install command first.`,
            });
          } else {
            checks.push({
              check: `${comp.name}: package`,
              status: 'info',
              detail: comp.helmAvailable
                ? `Helm-only component: ${comp.helmPackage}`
                : `Brain-only component: ${comp.brainPackage}`,
            });
          }
        }

        // Zoneless check
        if (context.isZoneless) {
          checks.push({
            check: 'Zoneless mode',
            status: 'info',
            detail:
              'Zoneless mode detected. Spartan components are compatible with zoneless Angular.',
          });
        }

        // OnPush reminder
        checks.push({
          check: 'Change detection',
          status: 'info',
          detail:
            'All Spartan components use OnPush. Ensure your components using Spartan also use ChangeDetectionStrategy.OnPush.',
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  auditedComponents: args.components,
                  checkCount: checks.length,
                  checks,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    },
  ];
}
