import { describe, expect, it } from 'vitest';
import type { SearchableItem } from '../registry/registry.js';
import { searchItems } from './fuzzy.js';

const items: SearchableItem[] = [
  { name: 'dialog', type: 'component', category: 'overlay', description: 'Brain + Helm component' },
  { name: 'alert-dialog', type: 'component', category: 'overlay', description: 'Brain + Helm component' },
  { name: 'button', type: 'component', category: 'action', description: 'Brain + Helm component' },
  { name: 'sidebar-inset', type: 'block', category: 'sidebar' },
  { name: 'installation', type: 'doc' },
];

describe('searchItems', () => {
  it('finds exact match', () => {
    const results = searchItems(items, 'dialog');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].item.name).toBe('dialog');
  });

  it('finds partial match', () => {
    const results = searchItems(items, 'btn');
    expect(results.some((r) => r.item.name === 'button')).toBe(true);
  });

  it('respects limit', () => {
    const results = searchItems(items, 'dialog', 1);
    expect(results.length).toBe(1);
  });

  it('returns scores', () => {
    const results = searchItems(items, 'dialog');
    for (const r of results) {
      expect(typeof r.score).toBe('number');
    }
  });

  it('returns empty for no match', () => {
    const results = searchItems(items, 'xyznonexistent');
    expect(results).toHaveLength(0);
  });

  it('searches across name, category, description', () => {
    const results = searchItems(items, 'overlay');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('uses default limit of 10', () => {
    const manyItems: SearchableItem[] = Array.from({ length: 20 }, (_, i) => ({
      name: `comp-${i}`,
      type: 'component' as const,
    }));
    const results = searchItems(manyItems, 'comp');
    expect(results.length).toBeLessThanOrEqual(10);
  });
});
