import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CacheManager } from '../cache/cache-manager.js';
import type { AnalogApiClient } from '../data/analog-api.js';
import { componentNotFound } from '../errors/errors.js';
import type { RegistryLoader } from '../registry/registry.js';

export function registerPromptHandlers(
  server: McpServer,
  registry: RegistryLoader,
  cacheManager: CacheManager,
  analogApi: AnalogApiClient,
): void {
  // 1. Get started with a component
  server.prompt(
    'spartan-get-started',
    'Get started with a Spartan UI component — installation, API overview, and basic usage',
    {
      componentName: z.string().describe("Component name (e.g. 'dialog', 'button')"),
      layer: z
        .enum(['brain', 'helm', 'both'])
        .optional()
        .describe('Focus on Brain (headless), Helm (styled), or both'),
    },
    async (args) => {
      const name = args.componentName.toLowerCase();
      const layer = args.layer ?? 'helm';
      const comp = registry.getComponent(name);
      if (!comp) throw componentNotFound(name);

      const data = await cacheManager.get('components', name, () => analogApi.getComponent(name));

      const relevantAPI =
        layer === 'brain'
          ? data.brainAPI
          : layer === 'helm'
            ? data.helmAPI
            : [...data.brainAPI, ...data.helmAPI];

      const apiSummary = relevantAPI
        .map((d) => `- **${d.name}** — \`${d.selector}\` (${d.inputs.length} inputs)`)
        .join('\n');

      const installCmd = `npx nx generate @spartan-ng/cli:ui --name=${name}`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Help me get started with the Spartan **${name}** component (${layer} layer). Show me the installation, API, and a basic usage example.`,
            },
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: `# Getting Started with ${name}\n\n## Installation\n\`\`\`bash\n${installCmd}\n\`\`\`\n\nPackages: \`${comp.brainPackage}\` + \`${comp.helmPackage}\`\n\n## API (${layer})\n\n${apiSummary}\n\n## Documentation\n${comp.url}\n\nUse \`spartan_view\` for full API details with inputs/outputs, or \`spartan_source\` to read the TypeScript source code.`,
            },
          },
        ],
      };
    },
  );

  // 2. Compare Brain vs Helm
  server.prompt(
    'spartan-compare-layers',
    'Compare Brain (headless) vs Helm (styled) APIs for a component',
    {
      componentName: z.string().describe('Component name'),
    },
    async (args) => {
      const name = args.componentName.toLowerCase();
      const comp = registry.getComponent(name);
      if (!comp) throw componentNotFound(name);

      const data = await cacheManager.get('components', name, () => analogApi.getComponent(name));

      const brainList = data.brainAPI
        .map(
          (d) => `| \`${d.name}\` | \`${d.selector}\` | ${d.inputs.length} | ${d.outputs.length} |`,
        )
        .join('\n');

      const helmList = data.helmAPI
        .map(
          (d) => `| \`${d.name}\` | \`${d.selector}\` | ${d.inputs.length} | ${d.outputs.length} |`,
        )
        .join('\n');

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Compare the Brain and Helm layers for the **${name}** component. When should I use each?`,
            },
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: `# ${name}: Brain vs Helm\n\n## Brain (Headless) — ${data.brainCount} directives\nUse Brain when you need custom styling or are building a component library.\n\n| Directive | Selector | Inputs | Outputs |\n|-----------|----------|--------|---------|\n${brainList || '| (none) | — | — | — |'}\n\n## Helm (Styled) — ${data.helmCount} components\nUse Helm for ready-to-use styled components with Tailwind/CVA variants.\n\n| Component | Selector | Inputs | Outputs |\n|-----------|----------|--------|---------|\n${helmList || '| (none) | — | — | — |'}\n\n## When to use which?\n- **Helm**: Standard UI, quick prototyping, consistent design system\n- **Brain**: Custom styling, library development, accessibility-only\n- **Both**: Helm uses Brain internally via \`hostDirectives\` — you don't need to apply both`,
            },
          },
        ],
      };
    },
  );

  // 3. Implement a feature
  server.prompt(
    'spartan-implement',
    'Implement a UI feature using Spartan components — guided step-by-step',
    {
      componentName: z.string().describe('Primary component to use'),
      feature: z.string().describe('Description of what you want to build'),
    },
    async (args) => {
      const name = args.componentName.toLowerCase();
      const comp = registry.getComponent(name);
      if (!comp) throw componentNotFound(name);

      const data = await cacheManager.get('components', name, () => analogApi.getComponent(name));

      const helmDirectives = data.helmAPI.map((d) => d.name).join(', ');
      const imports = comp.helmAvailable
        ? `import { ${helmDirectives || '...'} } from '${comp.helmPackage}';`
        : `import { ... } from '${comp.brainPackage}';`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Help me implement: **${args.feature}** using the Spartan **${name}** component. Give me a step-by-step guide with code.`,
            },
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: `# Implementing: ${args.feature}\n\n## Step 1: Install\n\`\`\`bash\nnpx nx generate @spartan-ng/cli:ui --name=${name}\n\`\`\`\n\n## Step 2: Import\n\`\`\`typescript\n${imports}\n\`\`\`\n\n## Step 3: Available API\n${data.helmAPI.map((d) => `- **${d.name}** (\`${d.selector}\`) — ${d.inputs.map((i) => i.name).join(', ') || 'no inputs'}`).join('\n')}\n\n## Step 4: Build\nUse \`spartan_view --name=${name} --sections=examples\` to see code examples, or \`spartan_source --name=${name}\` to read the source implementation.\n\n## Key Rules\n- Use Helm components (not Brain) for styled output\n- Use \`hlm()\` or \`classes()\` for class merging\n- Use Angular signals: \`input()\`, \`signal()\`, \`computed()\`\n- Use OnPush change detection\n- Use \`@if\`/\`@for\` control flow, not \`*ngIf\`/\`*ngFor\``,
            },
          },
        ],
      };
    },
  );

  // 4. Use a block
  server.prompt(
    'spartan-use-block',
    'Use a pre-built page block — source code, required components, and integration guide',
    {
      category: z.string().describe('Block category (sidebar, login, signup, calendar)'),
      variant: z.string().describe("Block variant (e.g. 'sidebar-sticky-header')"),
    },
    async (args) => {
      const block = registry.getBlock(args.category, args.variant);

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Help me use the **${args.variant}** block from the ${args.category} category. Show me how to integrate it.`,
            },
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: `# Block: ${args.variant}\n\nCategory: ${args.category}\n${block ? `GitHub path: \`${block.githubPath}\`` : 'Block not found in registry.'}\n\n## How to get the source\nUse the \`spartan_block_source\` tool:\n\`\`\`\nspartan_block_source(category="${args.category}", variant="${args.variant}", includeShared=true)\n\`\`\`\n\nThis returns:\n- Block component TypeScript files\n- Shared utilities (nav, data)\n- Extracted imports (which Spartan components are needed)\n\n## Integration steps\n1. Fetch the block source with \`spartan_block_source\`\n2. Install required Spartan components (check the \`imports.spartan\` field)\n3. Copy the component files into your project\n4. Adapt imports to your project's path aliases\n5. Run \`spartan_audit\` to verify setup`,
            },
          },
        ],
      };
    },
  );

  // 5. Migration guide
  server.prompt(
    'spartan-migrate',
    'Migration guide for upgrading Spartan components between versions',
    {
      componentName: z.string().describe('Component to migrate'),
    },
    async (args) => {
      const name = args.componentName.toLowerCase();
      const comp = registry.getComponent(name);

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Help me migrate the **${name}** component to the latest Spartan version.`,
            },
          },
          {
            role: 'assistant' as const,
            content: {
              type: 'text' as const,
              text: `# Migrating: ${name}\n\n${comp ? `Current registry info: ${comp.brainPackage} + ${comp.helmPackage}` : 'Component not found.'}\n\n## Recommended migration steps\n\n1. **Check current version**: Look at your \`package.json\` for \`@spartan-ng/brain\` and \`@spartan-ng/helm\` versions\n\n2. **Read changelog**: Use \`spartan_docs(topic="changelog")\` for breaking changes\n\n3. **Update packages**:\n\`\`\`bash\nnpm update @spartan-ng/brain @spartan-ng/helm\n\`\`\`\n\n4. **Run migration generators**:\n\`\`\`bash\nnpx nx generate @spartan-ng/cli:migrate-brain-imports\nnpx nx generate @spartan-ng/cli:migrate-helm-imports\nnpx nx generate @spartan-ng/cli:migrate-naming-conventions\n\`\`\`\n\n5. **Check API changes**: Use \`spartan_view(name="${name}")\` to see the current API\n\n6. **Verify**: Use \`spartan_audit(components=["${name}"])\` to check setup\n\n## Common migration patterns\n- \`@Input()/@Output()\` → \`input()\`/\`output()\` signals\n- NgModules → Standalone components\n- \`*ngIf/*ngFor\` → \`@if/@for\` control flow\n- Constructor DI → \`inject()\``,
            },
          },
        ],
      };
    },
  );
}
