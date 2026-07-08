import { createElement, type ReactNode } from "react";
import { normalizeSearchText } from "./listSearch";
import { EXECUTION_TEXT_LINES_PER_PAGE } from "./pagination";

export interface TextMatch {
  start: number;
  end: number;
}

export function findTextMatches(text: string, query: string): TextMatch[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  const haystack = text.toLowerCase();
  const matches: TextMatch[] = [];
  let index = haystack.indexOf(normalizedQuery);

  while (index !== -1) {
    matches.push({ start: index, end: index + normalizedQuery.length });
    index = haystack.indexOf(normalizedQuery, index + normalizedQuery.length);
  }

  return matches;
}

export function pageIndexForMatch(
  text: string,
  match: TextMatch,
  linesPerPage = EXECUTION_TEXT_LINES_PER_PAGE,
): number {
  const lineIndex = text.slice(0, match.start).split("\n").length - 1;
  return Math.max(0, Math.floor(lineIndex / linesPerPage));
}

export function pageIndexForMatchAt(
  text: string,
  query: string,
  matchIndex: number,
  linesPerPage = EXECUTION_TEXT_LINES_PER_PAGE,
): number {
  const matches = findTextMatches(text, query);
  const match = matches[matchIndex];
  if (!match) {
    return 0;
  }
  return pageIndexForMatch(text, match, linesPerPage);
}

export function getPageCharRange(
  text: string,
  pageIndex: number,
  linesPerPage = EXECUTION_TEXT_LINES_PER_PAGE,
): { start: number; end: number } {
  const lines = text.split("\n");
  const startLine = pageIndex * linesPerPage;
  const endLine = Math.min(lines.length, startLine + linesPerPage);
  const prefix = lines.slice(0, startLine).join("\n");
  const start = startLine === 0 ? 0 : prefix.length + 1;
  const pageText = lines.slice(startLine, endLine).join("\n");
  return { start, end: start + pageText.length };
}

export function highlightTextOnPage(
  pageText: string,
  fullText: string,
  pageIndex: number,
  query: string,
  activeMatchIndex: number | null,
  linesPerPage = EXECUTION_TEXT_LINES_PER_PAGE,
): ReactNode {
  const { start: pageStart } = getPageCharRange(fullText, pageIndex, linesPerPage);
  const matches = findTextMatches(fullText, query);
  const pageMatches = matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.start >= pageStart && match.start < pageStart + pageText.length);

  if (pageMatches.length === 0) {
    return pageText;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  pageMatches.forEach(({ match, index }) => {
    const localStart = match.start - pageStart;
    const localEnd = match.end - pageStart;
    if (localStart > cursor) {
      segments.push(pageText.slice(cursor, localStart));
    }
    segments.push(
      createElement(
        "mark",
        {
          key: `${match.start}-${match.end}`,
          className:
            activeMatchIndex === index
              ? "search-highlight search-highlight--active"
              : "search-highlight",
        },
        pageText.slice(localStart, localEnd),
      ),
    );
    cursor = localEnd;
  });

  if (cursor < pageText.length) {
    segments.push(pageText.slice(cursor));
  }

  return segments;
}

export function highlightTextSegments(
  text: string,
  query: string,
  activeMatchIndex: number | null = null,
): ReactNode {
  const matches = findTextMatches(text, query);
  if (matches.length === 0) {
    return text;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      segments.push(text.slice(cursor, match.start));
    }
    segments.push(
      createElement(
        "mark",
        {
          key: `${match.start}-${match.end}`,
          className:
            activeMatchIndex === index
              ? "search-highlight search-highlight--active"
              : "search-highlight",
        },
        text.slice(match.start, match.end),
      ),
    );
    cursor = match.end;
  });

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return segments;
}