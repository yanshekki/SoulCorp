import { useMemo, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { filterByQuery } from "../../../utils/listSearch";
import { SearchableListToolbar } from "../SearchableListToolbar";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import type { AgentActivityEvent, AgentActivitySession } from "../../../types/agentActivity";

interface ActivityTimelineProps {
  onSelectSession: (sessionId: string, agentId: string) => void;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function eventLabel(event: AgentActivityEvent): string {
  switch (event.kind) {
    case "session_start":
      return "Session started";
    case "session_end":
      return "Session ended";
    case "step_start":
      return `Step · ${event.step ?? "start"}`;
    case "step_complete":
      return `Step done · ${event.step ?? "complete"}`;
    case "deliverable_ready":
      return "Deliverable ready";
    case "error":
      return "Error";
    case "status_change":
      return "Status change";
    default:
      return event.kind.replace(/_/g, " ");
  }
}

function sessionForEvent(
  sessions: AgentActivitySession[],
  event: AgentActivityEvent,
): AgentActivitySession | undefined {
  return sessions.find((session) => session.id === event.session_id);
}

function statusClass(session?: AgentActivitySession): string {
  if (!session) {
    return "queued";
  }
  if (session.status === "active") {
    return "running";
  }
  if (session.status === "failed") {
    return "failed";
  }
  return "succeeded";
}

export function ActivityTimeline({ onSelectSession }: ActivityTimelineProps) {
  const events = useAgentActivityStore((state) => state.events);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const selectedSessionId = useAgentActivityStore((state) => state.selectedSessionId);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);

  const visibleEvents = useMemo(() => {
    const milestoneEvents = events.filter(
      (event) => event.kind !== "token_delta" && event.kind !== "terminal_line",
    );
    const filtered = filterByQuery(milestoneEvents, debouncedQuery, (event) => {
      const session = sessionForEvent(sessions, event);
      return [
        event.kind,
        event.step ?? "",
        event.content_full ?? "",
        session?.agent_name ?? "",
        session?.work_node_title ?? "",
        session?.source ?? "",
        event.agent_id,
      ];
    });
    return [...filtered].slice(-120).reverse();
  }, [events, sessions, debouncedQuery]);

  const agentName = (agentId: string) =>
    sessions.find((session) => session.agent_id === agentId)?.agent_name ?? agentId;

  return (
    <div className="observatory-history-section">
      {events.length > 0 ? (
        <SearchableListToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search history by agent, task, step…"
          ariaLabel="Search observatory history"
          matchCount={debouncedQuery.trim() ? visibleEvents.length : undefined}
          totalCount={events.filter((event) => event.kind !== "token_delta" && event.kind !== "terminal_line").length}
        />
      ) : null}

      {visibleEvents.length === 0 ? (
        <p className="muted">
          {events.length === 0
            ? "No activity yet. Run a task or meeting to populate history."
            : `No matches for “${debouncedQuery}”.`}
        </p>
      ) : (
        <ul className="projects-execution-list observatory-history-list">
          {visibleEvents.map((event) => {
            const session = sessionForEvent(sessions, event);
            const selected = selectedSessionId === event.session_id;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  className={`projects-execution-item observatory-history-item${
                    selected ? " is-selected" : ""
                  }`}
                  onClick={() => onSelectSession(event.session_id, event.agent_id)}
                >
                  <div className="projects-execution-item-head">
                    <span
                      className={`execution-run-status execution-run-status--${statusClass(session)}`}
                    >
                      {eventLabel(event)}
                    </span>
                    {session?.status === "active" ? (
                      <span className="observatory-live-pill inline">LIVE</span>
                    ) : null}
                    <strong>{agentName(event.agent_id)}</strong>
                    {session?.source ? (
                      <span className="muted">{session.source}</span>
                    ) : null}
                  </div>
                  {event.content_full ? (
                    <p className="projects-execution-preview muted">{event.content_full}</p>
                  ) : null}
                  <span className="projects-execution-meta muted">{formatWhen(event.timestamp)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}