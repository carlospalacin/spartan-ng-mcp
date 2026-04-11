import { describe, expect, it } from 'vitest';
import {
  registryBlockSchema,
  registryComponentSchema,
  spartanRegistrySchema,
} from './schema.js';

describe('registryComponentSchema', () => {
  const valid = {
    name: 'dialog',
    brainAvailable: true,
    helmAvailable: true,
    brainPackage: '@spartan-ng/brain/dialog',
    helmPackage: '@spartan-ng/helm/dialog',
    brainDirectives: ['BrnDialogTrigger'],
    helmComponents: ['HlmDialogContent'],
    category: 'overlay',
    peerDependencies: ['button'],
    url: 'https://www.spartan.ng/components/dialog',
  };

  it('parses valid component', () => {
    expect(registryComponentSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing name', () => {
    const { name, ...rest } = valid;
    expect(() => registryComponentSchema.parse(rest)).toThrow();
  });

  it('rejects invalid category', () => {
    expect(() => registryComponentSchema.parse({ ...valid, category: 'invalid' })).toThrow();
  });

  it('accepts all valid categories', () => {
    const categories = [
      'form', 'action', 'layout', 'overlay', 'menu',
      'navigation', 'data-display', 'feedback', 'typography', 'misc',
    ];
    for (const category of categories) {
      expect(() => registryComponentSchema.parse({ ...valid, category })).not.toThrow();
    }
  });
});

describe('registryBlockSchema', () => {
  it('parses valid block', () => {
    const valid = {
      category: 'sidebar',
      variant: 'sticky-header',
      githubPath: 'libs/cli/src/generators/ui/libs/sidebar-sticky-header',
      spartanImports: ['dialog', 'button'],
    };
    expect(registryBlockSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing fields', () => {
    expect(() => registryBlockSchema.parse({})).toThrow();
  });
});

describe('spartanRegistrySchema', () => {
  it('parses valid registry', () => {
    const valid = {
      version: '1.0.0',
      generatedAt: '2024-01-01T00:00:00Z',
      spartanVersion: '0.0.5',
      components: {},
      blocks: {},
      docs: ['installation'],
    };
    expect(spartanRegistrySchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing version', () => {
    expect(() =>
      spartanRegistrySchema.parse({
        generatedAt: '2024-01-01',
        spartanVersion: '0.0.5',
        components: {},
        blocks: {},
        docs: [],
      }),
    ).toThrow();
  });
});
