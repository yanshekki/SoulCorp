import { filterByQuery } from "./listSearch";

export const SEARCH_TYPE_ALL = "all";

export type SearchTypeResolverMap<T> = {
  all: (item: T) => string[];
} & Record<string, (item: T) => string[]>;

export function filterByScopedQuery<T>(
  items: T[],
  query: string,
  type: string,
  resolvers: SearchTypeResolverMap<T>,
): T[] {
  const resolver = type !== SEARCH_TYPE_ALL && resolvers[type] ? resolvers[type] : resolvers.all;
  return filterByQuery(items, query, resolver);
}

export function prefilterItems<T>(
  items: T[],
  type: string,
  predicate: (item: T, type: string) => boolean,
): T[] {
  if (type === SEARCH_TYPE_ALL) {
    return items;
  }
  return items.filter((item) => predicate(item, type));
}