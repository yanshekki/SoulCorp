import { useMemo } from "react";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import type { AgentActivityEvent } from "../../../types/agentActivity";

interface ActivityTimelineProps {
  onSelectSession: (sessionId: string, agentId: string) => void;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString();
}

function eventLabel(event: AgentActivityEvent): string {
  switch (event.kind) {
    case "session_start":
      return "Session started";
    case "session_end":
      return "Session ended";
    case "step_start":
      return `Step started · ${event.step ?? ""}`;
    case "step_complete":
      return `Step complete · ${event.step ?? ""}`;
    case "token_delta":
      return "Streaming…";
    case "terminal_line":
      return "Terminal output";
    case "deliverable_ready":
      return "Deliverable ready";
    case "error":
      return "Error";
    default:
      return event.kind.replace(/_/g, " ");
  }
}

export function ActivityTimeline({ onSelectSession }: ActivityTimelineProps) {
  const events = useAgentActivityStore((state) => state.events);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const filterAgentId = useAgentActivityStore((state) => state.filterAgentId);
  const selectedSessionId = useAgentActivityStore((state) => state.selectedSessionId);

  const visibleEvents = useMemo(() => {
    const filtered = filterAgentId
      ? events.filter((event) => event.agent_id === filterAgentId)
      : events;
    return [...filtered]
      .filter((event) => event.kind !== "token_delta" && event.kind !== "terminal_line")
      .slice(-80)
      .reverse();
  }, [events, filterAgentId]);

  const agentName = (agentId: string) =>
    sessions.find((session) => session.agent_id === agentId)?.agent_name ?? agentId;

  return (
    <section className="observatory-timeline">
      <header className="observatory-timeline-header">
        <h3>Activity</h3>
        <p className="muted">{visibleEvents.length} events</p>
      </header>
      <ul className="observatory-timeline-list">
        {visibleEvents.length === 0 ? (
          <li className="muted">No activity yet. Run a task or meeting to populate the stream.</li>
        ) : (
          visibleEvents.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                className={`observatory-timeline-item ${
                  selectedSessionId === event.session_id ? "is-selected" : ""
                }`}
                onClick={() => onSelectSession(event.session_id, event.agent_id)}
              >
                <span className="observatory-timeline-time">{formatWhen(event.timestamp)}</span>
                <strong>{agentName(event.agent_id)}</strong>
                <span>{eventLabel(event)}</span>
                {event.content_full ? (
                  <p className="observatory-timeline-preview muted">{event.content_full}</p>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}