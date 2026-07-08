export const EXECUTION_LOG_PAGE_SIZE = 10;
export const EXECUTION_TEXT_LINES_PER_PAGE = 32;

export interface PaginatedItems<T> {
  pageItems: T[];
  totalPages: number;
  safePage: number;
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginatedItems<T> {
  if (pageSize <= 0 || items.length === 0) {
    return { pageItems: [], totalPages: 1, safePage: 0 };
  }
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    safePage,
  };
}

export function paginateText(text: string, linesPerPage = EXECUTION_TEXT_LINES_PER_PAGE): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const lines = trimmed.split("\n");
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage).join("\n"));
  }
  return pages;
}