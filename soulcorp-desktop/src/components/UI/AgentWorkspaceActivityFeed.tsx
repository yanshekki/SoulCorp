import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useI18n } from "../../i18n/I18nProvider";

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

/** Collapse stacked "Revision: Revision: …" from older re-reject bugs. */
function displayActivityTitle(title: string): string {
  let out = title.trim();
  // Keep a single "Revision: " after collapsing runs.
  out = out.replace(/(?:Revision:\s*)+/gi, "Revision: ");
  // Avoid "Revision: Revision:" leftover edge cases
  out = out.replace(/^(Revision:\s*)+/i, "Revision: ");
  // If title is "Deliverable — Revision: …", keep that shape once.
  out = out.replace(/^(Deliverable\s*[—-]\s*)(?:Revision:\s*)+/i, "$1Revision: ");
  out = out.replace(/^(Task\s*[—-]\s*)(?:Revision:\s*)+/i, "$1Revision: ");
  return out.trim();
}

export function AgentWorkspaceActivityFeed() {
  const { t } = useI18n();
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [entries, setEntries] = useState<AgentWorkspaceActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const [listPage, setListPage] = useState(0);
  const debouncedQuery = useDebouncedValue(searchQuery);
  const hasEntriesRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!activeCompanyId) {
      hasEntriesRef.current = false;
      setEntries([]);
      return;
    }
    // Soft refresh: keep existing rows visible; only show loading on first empty load.
    const showLoading = !hasEntriesRef.current;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const activity = await listAgentWorkspaceActivity(40);
      hasEntriesRef.current = activity.length > 0 || hasEntriesRef.current;
      setEntries(activity);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
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
        <h3>{t("activity.title")}</h3>
        <button
          type="button"
          className="agents-activity-refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? t("activity.loading") : t("activity.refresh")}
        </button>
      </header>
      <p className="muted agents-activity-subtitle">{t("activity.subtitle")}</p>

      {entries.length > 0 ? (
        <SearchableListToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder={t("activity.searchPlaceholder")}
          ariaLabel={t("activity.searchAria")}
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
            ariaLabel: t("activity.filterAria"),
            label: t("searchType.typeLabel"),
          }}
        />
      ) : null}

      {entries.length === 0 ? (
        <p className="muted">
          {loading ? t("activity.loadingFeed") : t("activity.empty")}
        </p>
      ) : debouncedQuery.trim() && filteredEntries.length === 0 ? (
        <p className="search-empty-hint muted">
          {t("events.noMatches", { query: debouncedQuery })}
        </p>
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
                  <span className="agents-activity-title">
                    {displayActivityTitle(entry.title)}
                  </span>
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
            label={t("activity.filterLabel")}
            onPageChange={setListPage}
          />
        </>
      )}
    </section>
  );
}