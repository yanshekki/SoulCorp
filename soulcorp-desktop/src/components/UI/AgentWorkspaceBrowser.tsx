import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAgentWorkspacePage,
  getAgentWorkspaceContext,
  readAgentWorkspacePage,
  searchAgentWorkspace,
} from "../../services/agentWorkspaceClient";
import { useGameStore } from "../../stores/gameStore";
import { openAgentWorkspace, openWorkspacePage } from "../../utils/openWorkspacePage";
import type { AgentRecord } from "../../types/game";
import type {
  AgentWorkspaceContext,
  AgentWorkspacePageView,
  WorkspacePageSummary,
  WorkspaceSearchResult,
} from "../../types/workspace";
import { SearchField } from "./SearchField";

interface AgentWorkspaceBrowserProps {
  agents: AgentRecord[];
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string) => void;
}

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

export function AgentWorkspaceBrowser({
  agents,
  selectedAgentId,
  onSelectAgent,
}: AgentWorkspaceBrowserProps) {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const selectableAgents = useMemo(
    () => agents.filter((agent) => agent.agent_kind !== "fate"),
    [agents],
  );

  const [agentId, setAgentId] = useState<string>("");
  const [context, setContext] = useState<AgentWorkspaceContext | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pagePreview, setPagePreview] = useState<AgentWorkspacePageView | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);

  const activeAgentId = selectedAgentId ?? agentId;

  useEffect(() => {
    if (selectedAgentId) {
      setAgentId(selectedAgentId);
    }
  }, [selectedAgentId]);

  useEffect(() => {
    if (activeAgentId || selectableAgents.length === 0) {
      return;
    }
    setAgentId(selectableAgents[0]?.id ?? "");
  }, [activeAgentId, selectableAgents]);

  const loadContext = useCallback(async () => {
    if (!activeCompanyId || !activeAgentId) {
      setContext(null);
      setPagePreview(null);
      setSelectedPageId(null);
      return;
    }
    setLoadingContext(true);
    setSearchResults(null);
    try {
      const nextContext = await getAgentWorkspaceContext(activeAgentId);
      setContext(nextContext);
      const firstPage = nextContext.pages[0]?.id ?? null;
      setSelectedPageId(firstPage);
    } catch (error) {
      setContext(null);
      setSelectedPageId(null);
      setPagePreview(null);
      setStatusMessage(String(error));
    } finally {
      setLoadingContext(false);
    }
  }, [activeAgentId, activeCompanyId, setStatusMessage]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!activeAgentId || !selectedPageId) {
      setPagePreview(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    void readAgentWorkspacePage(activeAgentId, selectedPageId)
      .then((page) => {
        if (!cancelled) {
          setPagePreview(page);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPagePreview(null);
          setStatusMessage(String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPreview(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgentId, selectedPageId, setStatusMessage]);

  useEffect(() => {
    if (!activeAgentId || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const query = searchQuery.trim();
    const timer = window.setTimeout(() => {
      void searchAgentWorkspace(activeAgentId, query, 12)
        .then((results) => setSearchResults(results))
        .catch((error) => {
          setSearchResults([]);
          setStatusMessage(String(error));
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [activeAgentId, searchQuery, setStatusMessage]);

  const handleAgentChange = (nextAgentId: string) => {
    setAgentId(nextAgentId);
    onSelectAgent?.(nextAgentId);
    setSearchQuery("");
    setSearchResults(null);
  };

  const listedPages: WorkspacePageSummary[] = useMemo(() => {
    if (searchResults) {
      return searchResults.map((result) => ({
        id: result.page_id,
        title: result.title,
        folder_id: result.folder_id,
        last_edited_at: "",
        last_edited_by: "",
      }));
    }
    return context?.pages ?? [];
  }, [context?.pages, searchResults]);

  const activeAgent = selectableAgents.find((agent) => agent.id === activeAgentId);

  const openSelectedInWorkspace = async () => {
    if (!selectedPageId || !pagePreview) {
      return;
    }
    await openWorkspacePage(selectedPageId, pagePreview.title);
  };

  const createPage = async () => {
    if (!activeAgentId || creatingPage) {
      return;
    }
    const title = window.prompt("New page title", "Notes");
    if (!title?.trim()) {
      return;
    }
    setCreatingPage(true);
    try {
      const page = await createAgentWorkspacePage(activeAgentId, title.trim());
      setStatusMessage(`Created "${page.title}" in ${activeAgent?.name ?? "agent"} workspace.`);
      await loadContext();
      setSelectedPageId(page.id);
      setSearchQuery("");
      setSearchResults(null);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setCreatingPage(false);
    }
  };

  if (selectableAgents.length === 0) {
    return (
      <section
        id="workspaces"
        className="agents-card agents-card--wide"
        data-agents-section="workspaces"
      >
        <header className="agents-card-header">
          <h3>Agent workspaces</h3>
        </header>
        <p className="muted">Hire agents to browse per-employee workspace folders and pages.</p>
      </section>
    );
  }

  return (
    <section
      id="workspaces"
      className="agents-card agents-card--wide"
      data-agents-section="workspaces"
    >
      <header className="agents-card-header">
        <h3>Agent workspaces</h3>
        <div className="agents-workspace-header-actions">
          <button
            type="button"
            className="agents-workspace-action"
            onClick={() => void loadContext()}
            disabled={loadingContext}
          >
            {loadingContext ? "Loading…" : "Refresh"}
          </button>
          {activeAgent ? (
            <button
              type="button"
              className="agents-workspace-action"
              onClick={() => void openAgentWorkspace(activeAgent.id, activeAgent.name)}
            >
              Open in Workspace
            </button>
          ) : null}
        </div>
      </header>
      <p className="muted agents-workspace-subtitle">
        Browse each agent&apos;s folder, search their docs, and preview pages before opening the
        full editor.
      </p>

      <div className="agents-workspace-browser">
        <aside className="agents-workspace-sidebar">
          <label className="field-label">
            Agent
            <select
              value={activeAgentId}
              onChange={(event) => handleAgentChange(event.target.value)}
            >
              {selectableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {agent.department}
                </option>
              ))}
            </select>
          </label>

          {context ? (
            <p className="muted agents-workspace-stats">
              {context.pages.length} pages · {context.files.length} files
            </p>
          ) : null}

          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search this agent's pages…"
            ariaLabel="Search agent workspace"
            matchCount={searchQuery.trim() ? listedPages.length : undefined}
          />

          <div className="agents-workspace-page-list" role="listbox" aria-label="Agent pages">
            {loadingContext ? (
              <p className="muted">Loading folder…</p>
            ) : listedPages.length === 0 ? (
              <p className="muted">
                {searchQuery.trim()
                  ? "No matching pages."
                  : "No pages yet — create one or run a task with agent tools."}
              </p>
            ) : (
              listedPages.map((page) => {
                const snippet = searchResults?.find((result) => result.page_id === page.id)?.snippet;
                return (
                  <button
                    key={page.id}
                    type="button"
                    role="option"
                    aria-selected={selectedPageId === page.id}
                    className={`agents-workspace-page-item${
                      selectedPageId === page.id ? " active" : ""
                    }`}
                    onClick={() => setSelectedPageId(page.id)}
                  >
                    <span className="agents-workspace-page-title">{page.title}</span>
                    <span className="agents-workspace-page-meta">
                      {snippet
                        ? snippet
                        : page.last_edited_by
                          ? `${page.last_edited_by} · ${formatRelativeTime(page.last_edited_at)}`
                          : "Page"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            className="primary-action agents-workspace-create"
            disabled={!activeAgentId || creatingPage}
            onClick={() => void createPage()}
          >
            {creatingPage ? "Creating…" : "New page"}
          </button>
        </aside>

        <div className="agents-workspace-preview">
          {!selectedPageId ? (
            <p className="muted">Select a page to preview its content.</p>
          ) : loadingPreview ? (
            <p className="muted">Loading preview…</p>
          ) : pagePreview ? (
            <>
              <header className="agents-workspace-preview-header">
                <div>
                  <h4>{pagePreview.title}</h4>
                  <p className="muted">
                    Edited by {pagePreview.last_edited_by} ·{" "}
                    {formatRelativeTime(pagePreview.last_edited_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => void openSelectedInWorkspace()}
                >
                  Edit in Workspace
                </button>
              </header>
              <pre className="agents-workspace-preview-body">{pagePreview.text || "(empty)"}</pre>
            </>
          ) : (
            <p className="muted">Could not load page preview.</p>
          )}

          {context && context.recent_edits.length > 0 ? (
            <footer className="agents-workspace-recent">
              <h5>Recent edits</h5>
              <ul>
                {context.recent_edits.slice(0, 5).map((entry) => (
                  <li key={`${entry.page_id}-${entry.last_edited_at}`}>
                    <button
                      type="button"
                      className="agents-workspace-recent-link"
                      onClick={() => {
                        setSelectedPageId(entry.page_id);
                        setSearchQuery("");
                        setSearchResults(null);
                      }}
                    >
                      {entry.title}
                    </button>
                  </li>
                ))}
              </ul>
            </footer>
          ) : null}
        </div>
      </div>
    </section>
  );
}