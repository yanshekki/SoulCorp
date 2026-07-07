import { useCallback, useEffect, useState } from "react";
import { listAgentWorkspaceActivity } from "../../services/agentWorkspaceClient";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { AgentWorkspaceActivityEntry } from "../../types/workspace";

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

      {entries.length === 0 ? (
        <p className="muted">
          {loading
            ? "Loading agent workspace activity…"
            : "No agent workspace edits yet. Run a scrum task with agent tools enabled."}
        </p>
      ) : (
        <ul className="agents-activity-feed">
          {entries.map((entry) => (
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
      )}
    </section>
  );
}