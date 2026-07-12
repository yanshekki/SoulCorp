import { invoke } from "../../utils/tauriInvoke";
import { useEffect, useMemo, useRef, useState } from "react";
import { WORKSPACE_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceSearchResult } from "../../types/workspace";
import { SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { useI18n } from "../../i18n/I18nProvider";
import { SearchField } from "../UI/SearchField";

interface WorkspaceSearchProps {
  onOpenResult: (pageId: string) => void;
}

export function WorkspaceSearch({ onOpenResult }: WorkspaceSearchProps) {
  const { t } = useI18n();
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const searchResults = useWorkspaceStore((state) => state.searchResults);
  const setSearchQuery = useWorkspaceStore((state) => state.setSearchQuery);
  const setSearchResults = useWorkspaceStore((state) => state.setSearchResults);
  const [searching, setSearching] = useState(false);
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await invoke<WorkspaceSearchResult[]>("search_workspace", { query });
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(searchQuery);
    }, 320);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const filteredResults = useMemo(() => {
    if (searchType === "file") {
      return [];
    }
    return searchResults;
  }, [searchResults, searchType]);

  return (
    <div className="ws-search">
      <SearchField
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t("workspace.searchPlaceholder")}
        ariaLabel={t("workspace.searchAria")}
        loading={searching}
        matchCount={
          searchQuery.trim() || searchType !== SEARCH_TYPE_ALL
            ? filteredResults.length
            : undefined
        }
        typeFilter={{
          value: searchType,
          onChange: setSearchType,
          options: WORKSPACE_SEARCH_TYPES,
          ariaLabel: t("workspace.searchTypeAria"),
          label: t("workspace.searchType"),
        }}
      />
      {filteredResults.length > 0 ? (
        <div className="ws-search-results">
          {filteredResults.map((result) => (
            <button
              key={result.page_id}
              type="button"
              className="ws-search-result"
              onClick={() => onOpenResult(result.page_id)}
            >
              <strong>{result.title}</strong>
              <span>{result.snippet}</span>
            </button>
          ))}
        </div>
      ) : searchQuery.trim() && !searching ? (
        <p className="ws-search-empty muted">{t("common.noMatches")}</p>
      ) : null}
    </div>
  );
}