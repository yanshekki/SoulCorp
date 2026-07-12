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
import { useI18n } from "../../../i18n/I18nProvider";

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

function eventLabel(
  event: AgentActivityEvent,
  t: (key: string, params?: Record<string, string | number | undefined | null>) => string,
): string {
  switch (event.kind) {
    case "session_start":
      return t("observatory.event.started");
    case "session_end":
      return t("observatory.event.ended");
    case "step_start":
      return t("observatory.event.stepStart", { step: event.step ?? "start" });
    case "step_complete":
      return t("observatory.event.stepDone", { step: event.step ?? "complete" });
    case "deliverable_ready":
      return t("observatory.event.deliverable");
    case "error":
      return t("observatory.event.error");
    case "status_change":
      return t("observatory.event.status");
    case "autopilot_phase_change":
      return event.content_full ?? t("observatory.event.phase");
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
    case "autopilot":
      return event.kind === "autopilot_phase_change";
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
  const { t } = useI18n();
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
          placeholder={t("observatory.searchHistory")}
          ariaLabel={t("observatory.searchHistoryAria")}
          matchCount={debouncedQuery.trim() || historyType !== SEARCH_TYPE_ALL ? filteredEvents.length : undefined}
          totalCount={milestoneEvents.length}
          typeFilter={{
            value: historyType,
            onChange: setHistoryType,
            options: OBSERVATORY_HISTORY_TYPES,
            ariaLabel: t("observatory.filterHistoryAria"),
          }}
        />
      ) : null}

      {filteredEvents.length === 0 ? (
        <p className="muted">
          {milestoneEvents.length === 0
            ? t("observatory.noActivity")
            : t("events.noMatches", { query: debouncedQuery })}
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
                        {eventLabel(event, t)}
                      </span>
                      {session?.status === "active" ? (
                        <span className="observatory-live-pill inline">{t("observatory.live")}</span>
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
            label={t("observatory.events")}
            onPageChange={setListPage}
          />
        </>
      )}
    </div>
  );
}