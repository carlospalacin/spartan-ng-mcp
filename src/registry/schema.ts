import { z } from 'zod';

export const registryComponentSchema = z.object({
  name: z.string(),
  brainAvailable: z.boolean(),
  helmAvailable: z.boolean(),
  brainPackage: z.string(),
  helmPackage: z.string(),
  brainDirectives: z.array(z.string()),
  helmComponents: z.array(z.string()),
  category: z.enum([
    'form',
    'action',
    'layout',
    'overlay',
    'menu',
    'navigation',
    'data-display',
    'feedback',
    'typography',
    'misc',
  ]),
  peerDependencies: z.array(z.string()),
  url: z.string(),
});

export type RegistryComponent = z.infer<typeof registryComponentSchema>;

export const registryBlockSchema = z.object({
  category: z.string(),
  variant: z.string(),
  githubPath: z.string(),
  spartanImports: z.array(z.string()),
});

export type RegistryBlock = z.infer<typeof registryBlockSchema>;

export const spartanRegistrySchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  spartanVersion: z.string(),
  components: z.record(z.string(), registryComponentSchema),
  blocks: z.record(z.string(), registryBlockSchema),
  docs: z.array(z.string()),
});

export type SpartanRegistry = z.infer<typeof spartanRegistrySchema>;
