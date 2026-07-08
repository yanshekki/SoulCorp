import { useCallback, useEffect, useMemo, useState } from "react";
import { listAgentWorkspaceActivity } from "../../services/agentWorkspaceClient";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { AgentWorkspaceActivityEntry } from "../../types/workspace";
import { WORKSPACE_ACTIVITY_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "./PaginationBar";
import { SearchableListToolbar } from "./SearchableListToolbar";

const ACTIVITY_PAGE_SIZE = 10;

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return date.toLocaleDateString();
}

export function AgentWorkspaceActivityFeed() {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [entries, setEntries] = useState<AgentWorkspaceActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const [listPage, setListPage] = useState(0);
  const debouncedQuery = useDebouncedValue(searchQuery);

  const refresh = useCallback(async () => {
    if (!activeCompanyId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      const activity = await listAgentWorkspaceActivity(40);
      setEntries(activity);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, setStatusMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredEntries = useMemo(
    () =>
      filterByScopedQuery(entries, debouncedQuery, searchType, {
        all: (entry) => [entry.title, entry.agent_name, entry.action, entry.page_id],
        title: (entry) => [entry.title],
        agent: (entry) => [entry.agent_name, entry.agent_id],
        action: (entry) => [entry.action],
      }),
    [entries, debouncedQuery, searchType],
  );

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredEntries, listPage, ACTIVITY_PAGE_SIZE),
    [filteredEntries, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [debouncedQuery, searchType, entries.length]);

  const openPage = async (entry: AgentWorkspaceActivityEntry) => {
    try {
      await useWorkspaceStore.getState().openPage(entry.page_id);
      setActivePanel("workspace");
      setStatusMessage(`Opened ${entry.title} in Workspace.`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <section
      id="activity"
      className="agents-card agents-card--wide"
      data-agents-section="activity"
    >
      <header className="agents-card-header">
        <h3>Workspace activity</h3>
        <button
          type="button"
          className="agents-activity-refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>
      <p className="muted agents-activity-subtitle">
        Recent pages edited by agents. Click an entry to open it in Workspace.
      </p>

      {entries.length > 0 ? (
        <SearchableListToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search activity by title, agent…"
          ariaLabel="Search workspace activity"
          matchCount={
            debouncedQuery.trim() || searchType !== SEARCH_TYPE_ALL
              ? filteredEntries.length
              : undefined
          }
          totalCount={entries.length}
          loading={loading}
          typeFilter={{
            value: searchType,
            onChange: setSearchType,
            options: WORKSPACE_ACTIVITY_SEARCH_TYPES,
            ariaLabel: "Filter workspace activity search field",
            label: "Field",
          }}
        />
      ) : null}

      {entries.length === 0 ? (
        <p className="muted">
          {loading
            ? "Loading agent workspace activity…"
            : "No agent workspace edits yet. Run a scrum task with agent tools enabled."}
        </p>
      ) : debouncedQuery.trim() && filteredEntries.length === 0 ? (
        <p className="search-empty-hint muted">No matches for &ldquo;{debouncedQuery}&rdquo;.</p>
      ) : (
        <>
          <ul className="agents-activity-feed">
            {pageItems.map((entry) => (
              <li key={`${entry.page_id}-${entry.last_edited_at}`}>
                <button
                  type="button"
                  className="agents-activity-item"
                  onClick={() => void openPage(entry)}
                >
                  <span className="agents-activity-title">{entry.title}</span>
                  <span className="agents-activity-meta">
                    {entry.agent_name} · {formatRelativeTime(entry.last_edited_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            label="Activity"
            onPageChange={setListPage}
          />
        </>
      )}
    </section>
  );
}