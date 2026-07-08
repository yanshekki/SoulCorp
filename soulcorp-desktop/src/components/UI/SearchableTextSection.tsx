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
  sectionId?: string;
  query?: string;
  onQueryChange?: (value: string) => void;
  showSearchToolbar?: boolean;
  activeMatchIndex?: number | null;
}

export function SearchableTextSection({
  title,
  text,
  page,
  onPageChange,
  label,
  variant = "default",
  searchPlaceholder,
  sectionId,
  query: controlledQuery,
  onQueryChange,
  showSearchToolbar = true,
  activeMatchIndex: controlledActiveMatchIndex,
}: SearchableTextSectionProps) {
  const [localQuery, setLocalQuery] = useState("");
  const [localActiveMatchIndex, setLocalActiveMatchIndex] = useState(0);
  const isControlled = controlledQuery !== undefined;
  const query = isControlled ? controlledQuery : localQuery;
  const setQuery = isControlled ? (onQueryChange ?? (() => undefined)) : setLocalQuery;
  const debouncedQuery = useDebouncedValue(query);
  const activeMatchIndex =
    controlledActiveMatchIndex !== undefined
      ? controlledActiveMatchIndex
      : localActiveMatchIndex;

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
    if (isControlled || controlledActiveMatchIndex !== undefined) {
      return;
    }
    setLocalActiveMatchIndex(0);
    if (!debouncedQuery.trim()) {
      return;
    }
    const nextPage = pageIndexForMatchAt(text, debouncedQuery, 0);
    if (nextPage !== page) {
      onPageChange(nextPage);
    }
  }, [debouncedQuery, text, isControlled, controlledActiveMatchIndex, page, onPageChange]);

  const goToMatch = (direction: 1 | -1) => {
    if (matches.length === 0 || controlledActiveMatchIndex !== undefined) {
      return;
    }
    const nextIndex =
      direction === 1
        ? (localActiveMatchIndex + 1) % matches.length
        : (localActiveMatchIndex - 1 + matches.length) % matches.length;
    setLocalActiveMatchIndex(nextIndex);
    const nextPage = pageIndexForMatchAt(text, debouncedQuery, nextIndex);
    if (nextPage !== page) {
      onPageChange(nextPage);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && controlledActiveMatchIndex === undefined) {
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
        matches.length > 0 && activeMatchIndex !== null ? activeMatchIndex : null,
      )
    : currentText;

  return (
    <div
      id={sectionId}
      className={`execution-run-text-block${
        variant === "error" ? " execution-run-text-block--error" : ""
      }`}
    >
      {title ? <h3>{title}</h3> : null}
      {showSearchToolbar ? (
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
          {matches.length > 1 && controlledActiveMatchIndex === undefined ? (
            <div className="searchable-text-match-nav">
              <button type="button" onClick={() => goToMatch(-1)}>
                Prev match
              </button>
              <span className="muted">
                {localActiveMatchIndex + 1} / {matches.length}
              </span>
              <button type="button" onClick={() => goToMatch(1)}>
                Next match
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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