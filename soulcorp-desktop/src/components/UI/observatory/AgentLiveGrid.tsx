import { useMemo, useState } from "react";
import { useGameStore } from "../../../stores/gameStore";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { EffectiveBrainPill } from "../brain/EffectiveBrainPill";
import { SearchableListToolbar } from "../SearchableListToolbar";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { EMPLOYEE_SEARCH_TYPES } from "../../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../../utils/searchTypeFilters";
import type { AgentActivitySession } from "../../../types/agentActivity";
import { useI18n } from "../../../i18n/I18nProvider";

interface AgentLiveGridProps {
  onSelectAgent: (agentId: string, sessionId?: string) => void;
}

function transportForActivity(
  transport: string,
): "api" | "subprocess" | "builtin" | undefined {
  if (transport === "api" || transport === "mock") {
    return "api";
  }
  if (transport === "subprocess") {
    return "subprocess";
  }
  if (transport === "llm_only" || transport === "builtin") {
    return "builtin";
  }
  return undefined;
}

function sourceLabel(
  source: AgentActivitySession["source"],
  t: (key: string, params?: Record<string, string | number | undefined | null>) => string,
): string {
  switch (source) {
    case "meeting":
      return t("observatory.source.meeting");
    case "execution":
      return t("observatory.source.execution");
    case "worker":
      return t("observatory.source.worker");
    case "workspace":
      return t("observatory.source.workspace");
    default:
      return source;
  }
}

export function AgentLiveGrid({ onSelectAgent }: AgentLiveGridProps) {
  const { t } = useI18n();
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const selectedSessionId = useAgentActivityStore((state) => state.selectedSessionId);
  const [showIdle, setShowIdle] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const debouncedQuery = useDebouncedValue(searchQuery);

  const activeSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.status === "active")
        .sort((left, right) => right.started_at.localeCompare(left.started_at)),
    [sessions],
  );

  const idleAgents = useMemo(
    () =>
      agentRecords.filter(
        (agent) =>
          agent.agent_kind !== "fate"
          && !activeSessions.some((session) => session.agent_id === agent.id),
      ),
    [agentRecords, activeSessions],
  );

  const filteredIdleAgents = useMemo(
    () =>
      filterByScopedQuery(idleAgents, debouncedQuery, searchType, {
        all: (agent) => [agent.name, agent.role, agent.department, agent.id],
        name: (agent) => [agent.name],
        role: (agent) => [agent.role],
        department: (agent) => [agent.department],
      }),
    [idleAgents, debouncedQuery, searchType],
  );

  if (activeSessions.length === 0) {
    return (
      <div className="observatory-empty-state">
        <p className="muted">{t("observatory.emptyLive")}</p>
        <p className="muted">{t("observatory.emptyLiveHint")}</p>
        <div className="observatory-quick-links">
          <button type="button" className="primary-action" onClick={() => setActivePanel("meeting")}>
            {t("observatory.startMeeting")}
          </button>
          <button type="button" className="secondary-action" onClick={() => setActivePanel("projects")}>
            {t("observatory.openProjects")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="observatory-live-section">
      <ul className="observatory-live-list">
        {activeSessions.map((session) => {
          const selected = selectedSessionId === session.id;
          return (
            <li key={session.id}>
              <button
                type="button"
                className={`observatory-live-item${selected ? " is-selected" : ""}`}
                onClick={() => onSelectAgent(session.agent_id, session.id)}
              >
                <div className="observatory-live-item-head">
                  <span className="observatory-live-pill">
                    <span className="observatory-live-dot" aria-hidden="true" />
                    {t("observatory.liveBadge")}
                  </span>
                  <span className="hub-pill online">{sourceLabel(session.source, t)}</span>
                  <strong>{session.agent_name}</strong>
                </div>
                <p className="muted observatory-live-item-meta">
                  {session.work_node_title ?? session.brain_label}
                </p>
                <div className="observatory-live-item-pills">
                  <EffectiveBrainPill
                    label={session.brain_label}
                    transport={transportForActivity(session.transport)}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {idleAgents.length > 0 ? (
        <div className="observatory-idle-section">
          <button
            type="button"
            className="observatory-idle-toggle"
            onClick={() => setShowIdle((current) => !current)}
          >
            {showIdle ? t("observatory.hideIdle", { n: idleAgents.length }) : t("observatory.showIdle", { n: idleAgents.length })}
          </button>
          {showIdle ? (
            <>
              <SearchableListToolbar
                query={searchQuery}
                onQueryChange={setSearchQuery}
                placeholder={t("observatory.searchIdle")}
                ariaLabel={t("observatory.searchIdleAria")}
                matchCount={debouncedQuery.trim() ? filteredIdleAgents.length : undefined}
                totalCount={idleAgents.length}
                typeFilter={{
                  value: searchType,
                  onChange: setSearchType,
                  options: EMPLOYEE_SEARCH_TYPES,
                  ariaLabel: t("observatory.filterIdleAria"),
                  label: t("workspace.filterField"),
                }}
              />
              <ul className="observatory-idle-list">
                {filteredIdleAgents.map((agent) => (
                  <li key={agent.id} className="agent-row observatory-idle-row">
                    <span className="agent-dot" style={{ backgroundColor: "#5a6a7a" }} />
                    <div>
                      <strong>{agent.name}</strong>
                      <p>
                        {agent.role} · {agent.department}
                      </p>
                    </div>
                    <span className="agent-state muted">{agent.status}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}