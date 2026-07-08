import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { filterByQuery } from "../../../utils/listSearch";
import {
  OBSERVATORY_HISTORY_PAGE_SIZE,
  paginateItems,
} from "../../../utils/pagination";
import { OBSERVATORY_HISTORY_TYPES } from "../../../data/searchFilterOptions";
import { SearchableListToolbar } from "../SearchableListToolbar";
import { PaginationBar } from "../PaginationBar";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import type { AgentActivityEvent, AgentActivitySession } from "../../../types/agentActivity";
import { prefilterItems, SEARCH_TYPE_ALL } from "../../../utils/searchTypeFilters";

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

function matchesHistoryType(
  event: AgentActivityEvent,
  session: AgentActivitySession | undefined,
  type: string,
): boolean {
  switch (type) {
    case SEARCH_TYPE_ALL:
      return true;
    case "meeting":
      return session?.source === "meeting";
    case "execution":
      return session?.source === "execution";
    case "step":
      return event.kind === "step_start" || event.kind === "step_complete";
    case "session":
      return event.kind === "session_start" || event.kind === "session_end";
    case "error":
      return event.kind === "error";
    case "deliverable":
      return event.kind === "deliverable_ready";
    default:
      return true;
  }
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
  const [historyType, setHistoryType] = useState(SEARCH_TYPE_ALL);
  const [listPage, setListPage] = useState(0);
  const debouncedQuery = useDebouncedValue(searchQuery);

  const milestoneEvents = useMemo(
    () =>
      events.filter(
        (event) => event.kind !== "token_delta" && event.kind !== "terminal_line",
      ),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const typed = prefilterItems(milestoneEvents, historyType, (event, type) =>
      matchesHistoryType(event, sessionForEvent(sessions, event), type),
    );
    const filtered = filterByQuery(typed, debouncedQuery, (event) => {
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
    return [...filtered].reverse();
  }, [milestoneEvents, sessions, debouncedQuery, historyType]);

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredEvents, listPage, OBSERVATORY_HISTORY_PAGE_SIZE),
    [filteredEvents, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [events.length, debouncedQuery, historyType]);

  useEffect(() => {
    if (listPage !== safePage) {
      setListPage(safePage);
    }
  }, [listPage, safePage]);

  const agentName = (agentId: string) =>
    sessions.find((session) => session.agent_id === agentId)?.agent_name ?? agentId;

  return (
    <div className="observatory-history-section">
      {milestoneEvents.length > 0 ? (
        <SearchableListToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search history by agent, task, step…"
          ariaLabel="Search observatory history"
          matchCount={debouncedQuery.trim() || historyType !== SEARCH_TYPE_ALL ? filteredEvents.length : undefined}
          totalCount={milestoneEvents.length}
          typeFilter={{
            value: historyType,
            onChange: setHistoryType,
            options: OBSERVATORY_HISTORY_TYPES,
            ariaLabel: "Filter observatory history type",
          }}
        />
      ) : null}

      {filteredEvents.length === 0 ? (
        <p className="muted">
          {milestoneEvents.length === 0
            ? "No activity yet. Run a task or meeting to populate history."
            : `No matches for “${debouncedQuery}”.`}
        </p>
      ) : (
        <>
          <ul className="projects-execution-list observatory-history-list">
            {pageItems.map((event) => {
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
          <PaginationBar
            className="observatory-history-pagination"
            page={safePage}
            totalPages={totalPages}
            label="Events"
            onPageChange={setListPage}
          />
        </>
      )}
    </div>
  );
}