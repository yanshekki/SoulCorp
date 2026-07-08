import { useEffect, useMemo, useRef } from "react";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { AgentLiveGrid } from "./AgentLiveGrid";
import { ActivityTimeline } from "./ActivityTimeline";
import { ThoughtStreamPane } from "./ThoughtStreamPane";

export const OBSERVATORY_SECTIONS = [
  { id: "agents", label: "Agents" },
  { id: "timeline", label: "Timeline" },
  { id: "stream", label: "Stream" },
] as const;

interface ObservatoryPanelProps {
  onSectionFocus?: (sectionId: string) => void;
}

export function ObservatoryPanel({ onSectionFocus }: ObservatoryPanelProps) {
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const events = useAgentActivityStore((state) => state.events);
  const selectedSessionId = useAgentActivityStore((state) => state.selectedSessionId);
  const selectAgent = useAgentActivityStore((state) => state.selectAgent);
  const selectSession = useAgentActivityStore((state) => state.selectSession);
  const setFilterAgent = useAgentActivityStore((state) => state.setFilterAgent);

  const kpis = useMemo(() => {
    const active = sessions.filter((session) => session.status === "active").length;
    const thinking = events.filter(
      (event) =>
        event.kind === "token_delta" &&
        sessions.some(
          (session) => session.id === event.session_id && session.status === "active",
        ),
    ).length;
    const meeting = sessions.filter(
      (session) => session.status === "active" && session.source === "meeting",
    ).length;
    const errors = events.filter((event) => event.kind === "error").length;
    return { active, thinking: thinking > 0 ? 1 : 0, meeting, errors };
  }, [sessions, events]);

  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ??
    sessions.find((session) => session.status === "active") ??
    null;

  const handleSelectAgent = (agentId: string) => {
    selectAgent(agentId);
    setFilterAgent(agentId);
    const active = sessions.find(
      (session) => session.agent_id === agentId && session.status === "active",
    );
    if (active) {
      selectSession(active.id);
    }
  };

  const handleSelectSession = (sessionId: string, agentId: string) => {
    selectSession(sessionId);
    selectAgent(agentId);
    setFilterAgent(agentId);
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
    <div className="observatory-layout" ref={scrollRootRef}>
      <section className="observatory-kpi-strip">
        <article>
          <span>Active</span>
          <strong>{kpis.active}</strong>
        </article>
        <article>
          <span>Thinking</span>
          <strong>{kpis.thinking}</strong>
        </article>
        <article>
          <span>Meeting</span>
          <strong>{kpis.meeting}</strong>
        </article>
        <article>
          <span>Errors</span>
          <strong>{kpis.errors}</strong>
        </article>
        <button
          type="button"
          className="observatory-clear-filter"
          onClick={() => {
            setFilterAgent(null);
            selectAgent(null);
          }}
        >
          Show all
        </button>
      </section>

      <div className="observatory-columns">
        <div id="agents" data-observatory-section="agents">
          <AgentLiveGrid onSelectAgent={handleSelectAgent} />
        </div>
        <div id="timeline" data-observatory-section="timeline">
          <ActivityTimeline onSelectSession={handleSelectSession} />
        </div>
        <div id="stream" data-observatory-section="stream">
          <ThoughtStreamPane session={selectedSession} events={events} />
        </div>
      </div>
    </div>
  );
}