import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { paginateText } from "../../utils/pagination";
import {
  findTextMatches,
  highlightTextOnPage,
  pageIndexForMatchAt,
} from "../../utils/textSearch";
import { PaginationBar } from "./PaginationBar";
import { SearchField } from "./SearchField";

interface SearchableTextSectionProps {
  title: string;
  text: string;
  page: number;
  onPageChange: (page: number) => void;
  label: string;
  variant?: "default" | "error" | "deliverable";
  searchPlaceholder?: string;
}

export function SearchableTextSection({
  title,
  text,
  page,
  onPageChange,
  label,
  variant = "default",
  searchPlaceholder,
}: SearchableTextSectionProps) {
  const [query, setQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query);

  const pages = useMemo(() => paginateText(text), [text]);
  const totalPages = Math.max(1, pages.length);
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const currentText = pages[safePage] ?? text;

  const matches = useMemo(
    () => findTextMatches(text, debouncedQuery),
    [text, debouncedQuery],
  );

  useEffect(() => {
    if (page !== safePage) {
      onPageChange(safePage);
    }
  }, [page, safePage, onPageChange]);

  useEffect(() => {
    setActiveMatchIndex(0);
    if (!debouncedQuery.trim()) {
      return;
    }
    const nextPage = pageIndexForMatchAt(text, debouncedQuery, 0);
    if (nextPage !== page) {
      onPageChange(nextPage);
    }
  }, [debouncedQuery, text]);

  const goToMatch = (direction: 1 | -1) => {
    if (matches.length === 0) {
      return;
    }
    const nextIndex =
      direction === 1
        ? (activeMatchIndex + 1) % matches.length
        : (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(nextIndex);
    const nextPage = pageIndexForMatchAt(text, debouncedQuery, nextIndex);
    if (nextPage !== page) {
      onPageChange(nextPage);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goToMatch(event.shiftKey ? -1 : 1);
    }
  };

  const renderedText = debouncedQuery.trim()
    ? highlightTextOnPage(
        currentText,
        text,
        safePage,
        debouncedQuery,
        matches.length > 0 ? activeMatchIndex : null,
      )
    : currentText;

  return (
    <div
      className={`execution-run-text-block${
        variant === "error" ? " execution-run-text-block--error" : ""
      }`}
    >
      {title ? <h3>{title}</h3> : null}
      <div className="searchable-text-toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
          ariaLabel={`Search ${label}`}
          matchCount={debouncedQuery.trim() ? matches.length : undefined}
          size="compact"
          onKeyDown={handleSearchKeyDown}
        />
        {matches.length > 1 ? (
          <div className="searchable-text-match-nav">
            <button type="button" onClick={() => goToMatch(-1)}>
              Prev match
            </button>
            <span className="muted">
              {activeMatchIndex + 1} / {matches.length}
            </span>
            <button type="button" onClick={() => goToMatch(1)}>
              Next match
            </button>
          </div>
        ) : null}
      </div>
      <pre
        className={`execution-run-pre${
          variant === "deliverable" ? " execution-run-pre--deliverable" : ""
        }`}
      >
        {renderedText}
      </pre>
      <PaginationBar
        className="execution-run-section-pagination"
        page={safePage}
        totalPages={totalPages}
        label={label}
        onPageChange={onPageChange}
      />
    </div>
  );
}