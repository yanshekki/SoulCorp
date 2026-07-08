import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceSearchResult } from "../../types/workspace";
import { SearchField } from "../UI/SearchField";

interface WorkspaceSearchProps {
  onOpenResult: (pageId: string) => void;
}

export function WorkspaceSearch({ onOpenResult }: WorkspaceSearchProps) {
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const searchResults = useWorkspaceStore((state) => state.searchResults);
  const setSearchQuery = useWorkspaceStore((state) => state.setSearchQuery);
  const setSearchResults = useWorkspaceStore((state) => state.setSearchResults);
  const [searching, setSearching] = useState(false);
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

  return (
    <div className="ws-search">
      <SearchField
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search pages & files…"
        ariaLabel="Search workspace"
        loading={searching}
        matchCount={searchQuery.trim() ? searchResults.length : undefined}
      />
      {searchResults.length > 0 ? (
        <div className="ws-search-results">
          {searchResults.map((result) => (
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
        <p className="ws-search-empty muted">No matches</p>
      ) : null}
    </div>
  );
}