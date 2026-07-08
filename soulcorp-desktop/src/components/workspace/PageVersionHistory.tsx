import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { PageVersionSummary, WorkspacePage } from "../../types/workspace";
import { VERSION_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "../UI/PaginationBar";
import { SearchableListToolbar } from "../UI/SearchableListToolbar";

const VERSION_PAGE_SIZE = 10;

interface PageVersionHistoryProps {
  pageId: string;
  onRestored: (page: WorkspacePage) => void;
}

export function PageVersionHistory({ pageId, onRestored }: PageVersionHistoryProps) {
  const [versions, setVersions] = useState<PageVersionSummary[]>([]);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const [listPage, setListPage] = useState(0);
  const debouncedQuery = useDebouncedValue(searchQuery);

  useEffect(() => {
    void invoke<PageVersionSummary[]>("list_page_versions", { pageId })
      .then(setVersions)
      .catch(() => setVersions([]));
    setSearchQuery("");
    setSearchType(SEARCH_TYPE_ALL);
    setListPage(0);
  }, [pageId]);

  const filteredVersions = useMemo(
    () =>
      filterByScopedQuery(versions, debouncedQuery, searchType, {
        all: (entry) => [
          entry.title,
          entry.editor,
          String(entry.version),
          new Date(entry.saved_at).toLocaleString(),
        ],
        author: (entry) => [entry.editor],
        summary: (entry) => [entry.title],
      }),
    [versions, debouncedQuery, searchType],
  );

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredVersions, listPage, VERSION_PAGE_SIZE),
    [filteredVersions, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [debouncedQuery, searchType, versions.length]);

  const restore = async (version: number) => {
    setRestoring(version);
    try {
      const page = await invoke<WorkspacePage>("restore_page_version", {
        request: { page_id: pageId, version },
      });
      onRestored(page);
      const next = await invoke<PageVersionSummary[]>("list_page_versions", { pageId });
      setVersions(next);
    } finally {
      setRestoring(null);
    }
  };

  if (versions.length === 0) {
    return null;
  }

  return (
    <section className="page-version-history">
      <h3>Version history</h3>
      <SearchableListToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Search versions…"
        ariaLabel="Search version history"
        matchCount={
          debouncedQuery.trim() || searchType !== SEARCH_TYPE_ALL
            ? filteredVersions.length
            : undefined
        }
        totalCount={versions.length}
        typeFilter={{
          value: searchType,
          onChange: setSearchType,
          options: VERSION_SEARCH_TYPES,
          ariaLabel: "Filter version search field",
          label: "Field",
        }}
      />
      {debouncedQuery.trim() && filteredVersions.length === 0 ? (
        <p className="search-empty-hint muted">No matches for &ldquo;{debouncedQuery}&rdquo;.</p>
      ) : (
        <>
          <ul>
            {pageItems.map((entry) => (
              <li key={entry.version}>
                <div>
                  <strong>v{entry.version}</strong> · {entry.editor} · {entry.title}
                  <span className="muted"> — {new Date(entry.saved_at).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  className="tiny-btn"
                  disabled={restoring === entry.version}
                  onClick={() => void restore(entry.version)}
                >
                  {restoring === entry.version ? "Restoring..." : "Restore"}
                </button>
              </li>
            ))}
          </ul>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            label="Versions"
            onPageChange={setListPage}
          />
        </>
      )}
    </section>
  );
}