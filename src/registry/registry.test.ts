import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpartanError } from '../errors/errors.js';
import { RegistryLoader } from './registry.js';
import type { SpartanRegistry } from './schema.js';

function makeRegistry(overrides: Partial<SpartanRegistry> = {}): SpartanRegistry {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    spartanVersion: '0.0.5',
    components: {
      dialog: {
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
      },
      button: {
        name: 'button',
        brainAvailable: true,
        helmAvailable: true,
        brainPackage: '@spartan-ng/brain/button',
        helmPackage: '@spartan-ng/helm/button',
        brainDirectives: ['BrnButton'],
        helmComponents: ['HlmButton'],
        category: 'action',
        peerDependencies: [],
        url: 'https://www.spartan.ng/components/button',
      },
    },
    blocks: {
      'sidebar/inset': {
        category: 'sidebar',
        variant: 'inset',
        githubPath: 'libs/cli/src/generators/ui/libs/sidebar-inset',
        spartanImports: ['dialog'],
      },
    },
    docs: ['installation', 'theming'],
    ...overrides,
  };
}

describe('RegistryLoader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'spartan-reg-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('loads from file path', async () => {
    const filePath = join(tempDir, 'registry.json');
    await writeFile(filePath, JSON.stringify(makeRegistry()), 'utf-8');
    const loader = new RegistryLoader(filePath);
    await loader.initialize();
    expect(loader.getComponentCount()).toBe(2);
  });

  it('uses empty registry when file not found', async () => {
    const loader = new RegistryLoader(join(tempDir, 'missing.json'));
    await loader.initialize();
    expect(loader.getComponentCount()).toBe(0);
  });

  it('throws on invalid JSON', async () => {
    const filePath = join(tempDir, 'bad.json');
    await writeFile(filePath, 'not json', 'utf-8');
    const loader = new RegistryLoader(filePath);
    await expect(loader.initialize()).rejects.toThrow(SpartanError);
  });

  it('throws if not initialized', () => {
    const loader = new RegistryLoader();
    expect(() => loader.getComponent('dialog')).toThrow(SpartanError);
  });

  describe('after initialization', () => {
    let loader: RegistryLoader;

    beforeEach(async () => {
      const filePath = join(tempDir, 'registry.json');
      await writeFile(filePath, JSON.stringify(makeRegistry()), 'utf-8');
      loader = new RegistryLoader(filePath);
      await loader.initialize();
    });

    it('getComponent returns component', () => {
      const comp = loader.getComponent('dialog');
      expect(comp?.name).toBe('dialog');
    });

    it('getComponent is case-insensitive', () => {
      expect(loader.getComponent('Dialog')).not.toBeNull();
    });

    it('getComponent returns null for unknown', () => {
      expect(loader.getComponent('unknown')).toBeNull();
    });

    it('listComponents returns all', () => {
      expect(loader.listComponents()).toHaveLength(2);
    });

    it('listBlocks returns all', () => {
      expect(loader.listBlocks()).toHaveLength(1);
    });

    it('getBlock returns block', () => {
      const block = loader.getBlock('sidebar', 'inset');
      expect(block?.category).toBe('sidebar');
    });

    it('getBlock returns null for unknown', () => {
      expect(loader.getBlock('unknown', 'nope')).toBeNull();
    });

    it('listDocs returns docs', () => {
      expect(loader.listDocs()).toEqual(['installation', 'theming']);
    });

    it('getSearchableItems includes components, blocks, docs', () => {
      const items = loader.getSearchableItems();
      expect(items.some((i) => i.type === 'component')).toBe(true);
      expect(items.some((i) => i.type === 'block')).toBe(true);
      expect(items.some((i) => i.type === 'doc')).toBe(true);
    });

    it('isStale returns false for fresh registry', () => {
      expect(loader.isStale()).toBe(false);
    });

    it('isStale returns true for old registry', async () => {
      const oldDate = new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString();
      const filePath = join(tempDir, 'old.json');
      await writeFile(filePath, JSON.stringify(makeRegistry({ generatedAt: oldDate })), 'utf-8');
      const old = new RegistryLoader(filePath);
      await old.initialize();
      expect(old.isStale()).toBe(true);
    });

    it('getVersion returns version', () => {
      expect(loader.getVersion()).toBe('1.0.0');
    });

    it('getSpartanVersion returns spartan version', () => {
      expect(loader.getSpartanVersion()).toBe('0.0.5');
    });

    it('getGeneratedAt returns date string', () => {
      expect(loader.getGeneratedAt()).toBeTruthy();
    });

    it('getBlockCount returns count', () => {
      expect(loader.getBlockCount()).toBe(1);
    });

    it('updateRegistry tracks changes', () => {
      const updated = makeRegistry();
      // Remove dialog, add card
      delete (updated.components as Record<string, unknown>)['dialog'];
      (updated.components as Record<string, unknown>)['card'] = {
        ...updated.components.button,
        name: 'card',
        category: 'layout',
      };
      // Modify button
      updated.components.button.brainDirectives = ['BrnButton', 'BrnButtonNew'];

      const diff = loader.updateRegistry(updated);
      expect(diff.added).toContain('card');
      expect(diff.removed).toContain('dialog');
      expect(diff.updated).toContain('button');
    });
  });
});
