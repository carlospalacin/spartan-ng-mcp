import fuzzysort from 'fuzzysort';
import type { SearchableItem } from '../registry/registry.js';

export interface SearchResult {
  item: SearchableItem;
  score: number;
}

export function searchItems(items: SearchableItem[], query: string, limit = 10): SearchResult[] {
  const results = fuzzysort.go(query, items, {
    keys: ['name', 'category', 'description'],
    limit,
    threshold: -10000,
  });

  return results.map((result) => ({
    item: result.obj,
    score: result.score,
  }));
}
