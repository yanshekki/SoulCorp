import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useGameStore } from "../../../stores/gameStore";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { AgentLiveGrid } from "./AgentLiveGrid";
import { ActivityTimeline } from "./ActivityTimeline";
import { ThoughtStreamPane } from "./ThoughtStreamPane";

export const OBSERVATORY_SECTIONS = [
  { id: "overview", label: "Overview", hint: "Status & how to use" },
  { id: "live", label: "Live now", hint: "Agents thinking now" },
  { id: "history", label: "History", hint: "Past sessions" },
  { id: "stream", label: "Mind stream", hint: "Tokens & output" },
] as const;

interface ObservatoryPanelProps {
  onSectionFocus?: (sectionId: string) => void;
}

function ObservatoryCard({
  id,
  title,
  description,
  badge,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="observatory-card"
      data-observatory-section={id}
    >
      <header className="observatory-card-header">
        {badge ? <p className="workflow-step-badge">{badge}</p> : null}
        <h3>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
      </header>
      <div className="observatory-card-body">{children}</div>
    </section>
  );
}

export function ObservatoryPanel({ onSectionFocus }: ObservatoryPanelProps) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const events = useAgentActivityStore((state) => state.events);
  const selectedSessionId = useAgentActivityStore((state) => state.selectedSessionId);
  const filterAgentId = useAgentActivityStore((state) => state.filterAgentId);
  const selectAgent = useAgentActivityStore((state) => state.selectAgent);
  const selectSession = useAgentActivityStore((state) => state.selectSession);
  const setFilterAgent = useAgentActivityStore((state) => state.setFilterAgent);

  const kpis = useMemo(() => {
    const active = sessions.filter((session) => session.status === "active");
    const streaming = active.some((session) =>
      events.some(
        (event) =>
          event.session_id === session.id
          && (event.kind === "token_delta" || event.kind === "terminal_line"),
      ),
    );
    return {
      active: active.length,
      streaming: streaming ? 1 : 0,
      meeting: active.filter((session) => session.source === "meeting").length,
      execution: active.filter((session) => session.source === "execution").length,
      errors: events.filter((event) => event.kind === "error").length,
    };
  }, [sessions, events]);

  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ??
    sessions.find((session) => session.status === "active") ??
    null;

  const focusAgentName = useMemo(() => {
    if (!filterAgentId) {
      return null;
    }
    return (
      sessions.find((session) => session.agent_id === filterAgentId)?.agent_name
      ?? filterAgentId
    );
  }, [filterAgentId, sessions]);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSelectAgent = (agentId: string, sessionId?: string) => {
    selectAgent(agentId);
    setFilterAgent(agentId);
    const session =
      (sessionId ? sessions.find((entry) => entry.id === sessionId) : null)
      ?? sessions.find(
        (entry) => entry.agent_id === agentId && entry.status === "active",
      )
      ?? [...sessions]
        .filter((entry) => entry.agent_id === agentId)
        .sort((left, right) => right.started_at.localeCompare(left.started_at))[0];
    if (session) {
      selectSession(session.id);
    }
    scrollToSection("stream");
  };

  const handleSelectSession = (sessionId: string, agentId: string) => {
    selectSession(sessionId);
    selectAgent(agentId);
    setFilterAgent(agentId);
    scrollToSection("stream");
  };

  const clearFocus = () => {
    setFilterAgent(null);
    selectAgent(null);
  };

  useEffect(() => {
    if (!onSectionFocus) {
      return;
    }
    const root = scrollRootRef.current?.closest(".app-page-content");
    const sections = scrollRootRef.current?.querySelectorAll("[data-observatory-section]");
    if (!root || !sections?.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-observatory-section");
        if (sectionId) {
          onSectionFocus(sectionId);
        }
      },
      { root, rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onSectionFocus, sessions.length, events.length]);

  return (
    <div className="observatory-panel observatory-panel--page" ref={scrollRootRef}>
      <ObservatoryCard
        id="overview"
        title="Agent Observatory"
        description="Watch live LLM tokens, execution steps, and subprocess output while agents work. Pick a live session or history event — the mind stream opens below."
      >
        <div className="agents-overview-stats observatory-overview-stats">
          <article>
            <strong>{kpis.active}</strong>
            <span>Active sessions</span>
          </article>
          <article>
            <strong>{kpis.streaming}</strong>
            <span>Streaming now</span>
          </article>
          <article>
            <strong>{kpis.meeting}</strong>
            <span>Meeting turns</span>
          </article>
          <article>
            <strong>{kpis.execution}</strong>
            <span>Task runs</span>
          </article>
          <article>
            <strong>{kpis.errors}</strong>
            <span>Errors logged</span>
          </article>
        </div>
        <div className="observatory-quick-links">
          <button type="button" className="secondary-action" onClick={() => scrollToSection("live")}>
            Jump to live
          </button>
          <button type="button" className="secondary-action" onClick={() => setActivePanel("meeting")}>
            Open Meeting
          </button>
          <button type="button" className="secondary-action" onClick={() => setActivePanel("projects")}>
            Projects & execution
          </button>
        </div>
      </ObservatoryCard>

      <ObservatoryCard
        id="live"
        badge="Live"
        title="Thinking now"
        description="Agents with an active session. Click one to open their mind stream."
      >
        <AgentLiveGrid onSelectAgent={handleSelectAgent} />
      </ObservatoryCard>

      <ObservatoryCard
        id="history"
        title="Session history"
        description="Step milestones and outcomes. Token chunks are hidden here — open the mind stream for the full live text."
      >
        <ActivityTimeline onSelectSession={handleSelectSession} />
      </ObservatoryCard>

      <ObservatoryCard
        id="stream"
        badge="Stream"
        title="Mind stream"
        description={
          selectedSession
            ? `Watching ${selectedSession.agent_name}${
              selectedSession.work_node_title ? ` · ${selectedSession.work_node_title}` : ""
            }`
            : "Select a live agent or history event to load tokens, steps, terminal output, and deliverables."
        }
      >
        {focusAgentName ? (
          <div className="observatory-focus-bar">
            <span className="hub-pill tier">Focused · {focusAgentName}</span>
            <button type="button" className="secondary-action" onClick={clearFocus}>
              Clear focus
            </button>
          </div>
        ) : null}
        <ThoughtStreamPane session={selectedSession} events={events} />
      </ObservatoryCard>
    </div>
  );
}