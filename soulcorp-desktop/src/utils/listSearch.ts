export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function tokenizeQuery(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter(Boolean);
}

export function fieldsMatchQuery(fields: string[], tokens: string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const normalizedFields = fields
    .map((field) => normalizeSearchText(field))
    .filter(Boolean);
  if (normalizedFields.length === 0) {
    return false;
  }
  return tokens.every((token) =>
    normalizedFields.some((field) => field.includes(token)),
  );
}

export function filterByQuery<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => string[],
): T[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return items;
  }
  return items.filter((item) => fieldsMatchQuery(getSearchableFields(item), tokens));
}