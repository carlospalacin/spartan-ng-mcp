import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categorize } from './categorize.js';

interface RegistryShape {
  components: Record<string, { category: string }>;
}

const registry = JSON.parse(
  readFileSync(new URL('./registry.json', import.meta.url), 'utf-8'),
) as RegistryShape;

describe('categorize', () => {
  it('reproduces the category of every component in the committed registry.json', () => {
    const mismatches: string[] = [];
    for (const [name, comp] of Object.entries(registry.components)) {
      if (categorize(name) !== comp.category) {
        mismatches.push(`${name}: expected ${comp.category}, got ${categorize(name)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('returns misc for unknown component names', () => {
    expect(categorize('totally-unknown-component-xyz')).toBe('misc');
  });

  it('classifies a known sampling correctly', () => {
    expect(categorize('dialog')).toBe('overlay');
    expect(categorize('button')).toBe('action');
    expect(categorize('input')).toBe('form');
    expect(categorize('card')).toBe('layout');
  });
});
