import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpartanError } from '../errors/errors.js';
import { AnalogApiClient } from './analog-api.js';

// We need to reset the module-level cache between tests
let client: AnalogApiClient;

beforeEach(() => {
  client = new AnalogApiClient();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchResponse(data: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

const validApiResponse = {
  docsData: {
    dialog: {
      brain: {
        BrnDialogTrigger: {
          selector: '[brnDialogTrigger]',
          file: 'libs/brain/dialog/src/lib/brn-dialog-trigger.ts',
          inputs: [{ name: 'delay', type: 'number' }],
          outputs: [],
          models: [],
        },
      },
      helm: {
        HlmDialogContent: {
          selector: 'hlm-dialog-content',
          file: 'libs/helm/dialog/src/lib/hlm-dialog-content.ts',
          inputs: [],
          outputs: [],
        },
      },
    },
  },
  primitivesData: {
    dialog: {
      default: '<hlm-dialog>...</hlm-dialog>',
      advanced: { code: 'const x = 1;', language: 'typescript' },
    },
  },
  manualInstallSnippets: {
    dialog: {
      'npm-install': 'npm install @spartan-ng/brain/dialog @spartan-ng/helm/dialog',
    },
  },
};

describe('AnalogApiClient', () => {
  describe('fetchAll', () => {
    it('fetches and parses API response', async () => {
      mockFetchResponse(validApiResponse);
      const result = await client.fetchAll(true);
      expect(result.docsData).toBeDefined();
      expect(result.primitivesData).toBeDefined();
    });

    it('throws on invalid schema', async () => {
      mockFetchResponse({ invalid: true });
      await expect(client.fetchAll(true)).rejects.toThrow(SpartanError);
    });

    it('throws on oversized response', async () => {
      const huge = 'x'.repeat(11 * 1024 * 1024);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(huge, { status: 200 })),
      );
      await expect(client.fetchAll(true)).rejects.toThrow(SpartanError);
    });
  });

  describe('getComponent', () => {
    it('extracts brain and helm API', async () => {
      mockFetchResponse(validApiResponse);
      const comp = await client.getComponent('dialog', true);
      expect(comp.name).toBe('dialog');
      expect(comp.brainAPI.length).toBeGreaterThanOrEqual(1);
      expect(comp.brainAPI[0].name).toBe('BrnDialogTrigger');
      expect(comp.helmAPI.length).toBeGreaterThanOrEqual(1);
      expect(comp.helmAPI[0].name).toBe('HlmDialogContent');
    });

    it('extracts examples', async () => {
      mockFetchResponse(validApiResponse);
      const comp = await client.getComponent('dialog', true);
      expect(comp.examples.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts install snippets', async () => {
      mockFetchResponse(validApiResponse);
      const comp = await client.getComponent('dialog', true);
      expect(comp.installSnippets.length).toBeGreaterThanOrEqual(1);
    });

    it('handles missing component gracefully', async () => {
      mockFetchResponse(validApiResponse);
      const comp = await client.getComponent('nonexistent', true);
      expect(comp.brainAPI).toEqual([]);
      expect(comp.helmAPI).toEqual([]);
      expect(comp.examples).toEqual([]);
    });

    it('includes url and counts', async () => {
      mockFetchResponse(validApiResponse);
      const comp = await client.getComponent('dialog', true);
      expect(comp.url).toContain('dialog');
      expect(comp.brainCount).toBe(comp.brainAPI.length);
      expect(comp.helmCount).toBe(comp.helmAPI.length);
    });
  });

  describe('listAvailableComponents', () => {
    it('returns sorted component names', async () => {
      mockFetchResponse(validApiResponse);
      const names = await client.listAvailableComponents();
      expect(names).toContain('dialog');
      expect(names).toEqual([...names].sort());
    });
  });
});
