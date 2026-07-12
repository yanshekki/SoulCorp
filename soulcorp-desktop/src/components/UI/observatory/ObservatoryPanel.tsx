import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "../../../utils/tauriInvoke";
import { useGameStore } from "../../../stores/gameStore";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { AgentLiveGrid } from "./AgentLiveGrid";
import { ActivityTimeline } from "./ActivityTimeline";
import { ThoughtStreamPane } from "./ThoughtStreamPane";
import { useI18n } from "../../../i18n/I18nProvider";

export const OBSERVATORY_SECTIONS = [
  { id: "overview", label: "Overview", hint: "Status & how to use" },
  { id: "live", label: "Live now", hint: "Agents thinking now" },
  { id: "history", label: "History", hint: "Past sessions" },
  { id: "stream", label: "Mind stream", hint: "Tokens & output" },
] as const;

interface ObservatoryPanelProps {
  activeSection: string;
  onNavigateSection?: (sectionId: string) => void;
}

function ObservatoryCard({
  id,
  title,
  description,
  badge,
  activeSection,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  badge?: string;
  activeSection: string;
  children: ReactNode;
}) {
  if (activeSection !== id) {
    return null;
  }
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

interface ExportResult {
  path: string;
  format: string;
  message: string;
}

export function ObservatoryPanel({ activeSection, onNavigateSection }: ObservatoryPanelProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
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
    onNavigateSection?.("stream");
  };

  const handleSelectSession = (sessionId: string, agentId: string) => {
    selectSession(sessionId);
    selectAgent(agentId);
    setFilterAgent(agentId);
    onNavigateSection?.("stream");
  };

  const clearFocus = () => {
    setFilterAgent(null);
    selectAgent(null);
  };

  const exportSessions = useCallback(async () => {
    try {
      const result = await invoke<ExportResult>("export_agent_activity_markdown");
      setExportMessage(result.message);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return (
    <div className="observatory-panel observatory-panel--page" ref={scrollRootRef}>
      <ObservatoryCard
        id="overview"
        activeSection={activeSection}
        title={t("observatory.title")}
        description={t("observatory.desc")}
      >
        <div className="agents-overview-stats observatory-overview-stats">
          <article>
            <strong>{kpis.active}</strong>
            <span>{t("observatory.kpi.active")}</span>
          </article>
          <article>
            <strong>{kpis.streaming}</strong>
            <span>{t("observatory.kpi.streaming")}</span>
          </article>
          <article>
            <strong>{kpis.meeting}</strong>
            <span>{t("observatory.kpi.meeting")}</span>
          </article>
          <article>
            <strong>{kpis.execution}</strong>
            <span>{t("observatory.kpi.execution")}</span>
          </article>
          <article>
            <strong>{kpis.errors}</strong>
            <span>{t("observatory.kpi.errors")}</span>
          </article>
        </div>
        <div className="observatory-quick-links">
          <button type="button" className="secondary-action" onClick={() => onNavigateSection?.("live")}>
            {t("observatory.jumpLive")}
          </button>
          <button type="button" className="secondary-action" onClick={() => setActivePanel("meeting")}>
            {t("observatory.openMeeting")}
          </button>
          <button type="button" className="secondary-action" onClick={() => setActivePanel("projects")}>
            {t("observatory.openProjects")}
          </button>
          <button type="button" className="secondary-action" onClick={() => void exportSessions()}>
            {t("observatory.exportSessions")}
          </button>
        </div>
        {exportMessage ? <p className="muted observatory-export-status">{exportMessage}</p> : null}
      </ObservatoryCard>

      <ObservatoryCard
        id="live"
        activeSection={activeSection}
        badge={t("observatory.liveBadge")}
        title={t("observatory.thinkingNow")}
        description={t("observatory.thinkingDesc")}
      >
        <AgentLiveGrid onSelectAgent={handleSelectAgent} />
      </ObservatoryCard>

      <ObservatoryCard
        id="history"
        activeSection={activeSection}
        title={t("observatory.historyTitle")}
        description={t("observatory.historyDesc")}
      >
        <ActivityTimeline onSelectSession={handleSelectSession} />
      </ObservatoryCard>

      <ObservatoryCard
        id="stream"
        activeSection={activeSection}
        badge={t("observatory.streamBadge")}
        title={t("observatory.mindStream")}
        description={
          selectedSession
            ? t("observatory.watching", {
                name: selectedSession.agent_name,
                task: selectedSession.work_node_title
                  ? ` · ${selectedSession.work_node_title}`
                  : "",
              })
            : t("observatory.selectStream")
        }
      >
        {focusAgentName ? (
          <div className="observatory-focus-bar">
            <span className="hub-pill tier">{t("observatory.focused", { name: focusAgentName })}</span>
            <button type="button" className="secondary-action" onClick={clearFocus}>
              {t("observatory.clearFocus")}
            </button>
          </div>
        ) : null}
        <ThoughtStreamPane session={selectedSession} events={events} />
      </ObservatoryCard>
    </div>
  );
}