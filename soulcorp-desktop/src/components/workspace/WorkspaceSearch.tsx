import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceSearchResult } from "../../types/workspace";

interface WorkspaceSearchProps {
  onOpenResult: (pageId: string) => void;
}

export function WorkspaceSearch({ onOpenResult }: WorkspaceSearchProps) {
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const searchResults = useWorkspaceStore((state) => state.searchResults);
  const setSearchQuery = useWorkspaceStore((state) => state.setSearchQuery);
  const setSearchResults = useWorkspaceStore((state) => state.setSearchResults);

  const runSearch = async () => {
    const results = await invoke<WorkspaceSearchResult[]>("search_workspace", {
      query: searchQuery,
    });
    setSearchResults(results);
  };

  return (
    <div className="workspace-search">
      <input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search workspace..."
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void runSearch();
          }
        }}
      />
      <button type="button" onClick={() => void runSearch()}>
        Search
      </button>
      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map((result) => (
            <button
              key={result.page_id}
              type="button"
              className="search-result"
              onClick={() => onOpenResult(result.page_id)}
            >
              <strong>{result.title}</strong>
              <span>{result.snippet}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}