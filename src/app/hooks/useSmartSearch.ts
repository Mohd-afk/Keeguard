// PURPOSE: Provides implementation and configuration for useSmartSearch.ts.
import { useMemo } from 'react';
import type { VaultItem, CustomCategory } from '../store';

/**
 * Multi-dimensional, tokenized real-time search across all vault item fields.
 * Matches: Title, Username, URL, Notes, Category, Tags (labels), Metadata (type, dates).
 */
export function useSmartSearch(
  items: VaultItem[],
  query: string,
  categories: CustomCategory[] = []
): VaultItem[] {
  return useMemo(() => {
    if (!query.trim()) return items;

    const tokens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return items.filter((item) => {
      // Resolve custom category name
      const categoryName = item.categoryId
        ? categories.find((c) => c.id === item.categoryId)?.name || ''
        : '';

      const fields = [
        item.title,
        item.username,
        item.url,
        item.note,
        item.type,
        categoryName,
        ...(item.labels || []),
        item.createdAt,
        item.updatedAt,
      ].map((f) => String(f || '').toLowerCase());

      // Every search token must match at least one field
      return tokens.every((token) =>
        fields.some((field) => field.includes(token))
      );
    });
  }, [items, query, categories]);
}
