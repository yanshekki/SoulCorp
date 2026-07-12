import { showAgentMorale, showEventFeed, showSimulationChrome } from "../../config/features";
import { useGameStore } from "../../stores/gameStore";
import { totalCompanyTokens } from "../../utils/companyState";
import { agentInnovationScore, agentSkillLevel } from "../../utils/agentStats";
import { EventFeed } from "./EventFeed";
import { AgentActivityPill } from "./observatory/AgentActivityPill";
import { useI18n } from "../../i18n/I18nProvider";

export function Dashboard() {
  const { t } = useI18n();
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const agents = useGameStore((state) => state.agents);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const simulation = useGameStore((state) => state.simulation);
  const finance = useGameStore((state) => state.finance);
  const companyName = useGameStore((state) => state.companyName);

  const records = agentRecords.length > 0 ? agentRecords : null;
  const hasAgents = (records?.length ?? agents.length) > 0;

  return (
    <section className="dashboard-panel">
      <h2>{companyName || t("dashboard.title")}</h2>
      {!hasAgents ? (
        <p className="muted">{t("dashboard.noAgents")}</p>
      ) : null}
      <div className="kpi-grid">
        {showSimulationChrome ? (
          <>
            <article>
              <span>{t("dashboard.day")}</span>
              <strong>{simulation.dayNumber}</strong>
            </article>
            <article>
              <span>{t("dashboard.tick")}</span>
              <strong>{simulation.tick}</strong>
            </article>
          </>
        ) : null}
        <article>
          <span>{t("dashboard.tokens")}</span>
          <strong>{totalCompanyTokens(finance).toLocaleString()}</strong>
        </article>
        <article>
          <span>{t("dashboard.agents")}</span>
          <strong>{records?.length ?? agents.length}</strong>
        </article>
      </div>
      <div className="agent-list">
        <h3>{t("dashboard.liveAgents")}</h3>
        {(records ?? []).map((agent) => (
          <div key={agent.id} className="agent-row">
            <span className="agent-dot" style={{ backgroundColor: "#5ec8ff" }} />
            <div>
              <strong>{agent.name}</strong>
              <p>
                {agent.department}
                {showAgentMorale ? ` · morale ${(agent.morale * 100).toFixed(0)}%` : ""} · skill{" "}
                {agentSkillLevel(agent)} · innovation {agentInnovationScore(agent)}
              </p>
            </div>
            <AgentActivityPill
              agentId={agent.id}
              onClick={() => setActivePanel("observatory")}
            />
            <span className="agent-state">{agent.status}</span>
          </div>
        ))}
        {!records &&
          agents.map((agent) => (
            <div key={agent.id} className="agent-row">
              <span className="agent-dot" style={{ backgroundColor: agent.color }} />
              <div>
                <strong>{agent.name}</strong>
                <p>
                  {agent.department} · {agent.statusLabel}
                </p>
              </div>
              <AgentActivityPill
                agentId={agent.id}
                onClick={() => setActivePanel("observatory")}
              />
            </div>
          ))}
      </div>
      {showEventFeed ? <EventFeed /> : null}
    </section>
  );
}