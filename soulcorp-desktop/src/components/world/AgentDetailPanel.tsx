import { useGameStore } from "../../stores/gameStore";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { openAgentWorkspace } from "../../utils/openWorkspacePage";
import { hasMoraleDecorNearby } from "../../utils/furnitureInteractions";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import { DEPARTMENT_BUILDING, deskForAgent } from "../../data/worldLayout";
import { useI18n } from "../../i18n/I18nProvider";

interface AgentDetailPanelProps {
  agentId: string;
}

const SKILL_ICONS: Record<string, string> = {
  coding: "💻",
  ai: "🤖",
  design: "🎨",
  marketing: "📣",
  leadership: "⭐",
  default: "🔧",
};

function iconForSkill(skill: string): string {
  const key = skill.toLowerCase();
  for (const [match, icon] of Object.entries(SKILL_ICONS)) {
    if (match !== "default" && key.includes(match)) {
      return icon;
    }
  }
  return SKILL_ICONS.default;
}

export function AgentDetailPanel({ agentId }: AgentDetailPanelProps) {
  const { t } = useI18n();
  const record = useGameStore((state) =>
    state.agentRecords.find((agent) => agent.id === agentId),
  );
  const agent = useGameStore((state) => state.agents.find((item) => item.id === agentId));
  const selectAgent = useGameStore((state) => state.selectAgent);

  if (!record) {
    return null;
  }

  const skills = record.skills ?? defaultSkillsForRole(record.role);
  const buildingId = DEPARTMENT_BUILDING[record.department] ?? "hq";
  const office = normalizeOfficeVisual(
    useGameStore.getState().visualDesign.offices[buildingId],
    buildingId,
  );
  const desk = deskForAgent(buildingId, agentId);
  const moraleZone = hasMoraleDecorNearby(desk, office);

  return (
    <aside className="agent-detail-panel" role="complementary">
      <header>
        <h3>{record.name}</h3>
        <button type="button" onClick={() => selectAgent(null)} aria-label={t("world.closeAgent")}>
          ×
        </button>
      </header>
      <p className="muted">
        {record.role} · {record.department}
      </p>
      <dl className="agent-detail-stats">
        <div>
          <dt>{t("agentDetail.morale")}</dt>
          <dd>{(record.morale * 100).toFixed(0)}%</dd>
        </div>
        <div>
          <dt>{t("agentDetail.status")}</dt>
          <dd>{agent?.statusLabel ?? record.status}</dd>
        </div>
        {moraleZone ? (
          <div>
            <dt>{t("agentDetail.zoneBuff")}</dt>
            <dd>+5% morale (decor nearby)</dd>
          </div>
        ) : null}
      </dl>
      <div className="agent-detail-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => void openAgentWorkspace(record.id, record.name)}
        >
          {t("world.openWorkspace")}
        </button>
        <button
          type="button"
          onClick={() => {
            useAgentActivityStore.getState().selectAgent(record.id);
            useAgentActivityStore.getState().setFilterAgent(record.id);
            useGameStore.getState().setActivePanel("observatory");
            window.setTimeout(() => {
              document.getElementById("stream")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 120);
          }}
        >
          {t("world.viewMindStream")}
        </button>
      </div>

      <section>
        <h4>{t("agentDetail.skillsTools")}</h4>
        {skills.length === 0 ? (
          <p className="muted">{t("agentDetail.noSkills")}</p>
        ) : (
          <ul className="agent-skill-list">
            {skills.map((skill) => (
              <li key={skill}>
                <span aria-hidden="true">{iconForSkill(skill)}</span>
                {skill}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function defaultSkillsForRole(role: string): string[] {
  const lower = role.toLowerCase();
  if (lower.includes("engineer") || lower.includes("developer")) {
    return ["Coding", "AI"];
  }
  if (lower.includes("design")) {
    return ["Design", "UI"];
  }
  if (lower.includes("ceo") || lower.includes("executive")) {
    return ["Leadership", "Strategy"];
  }
  if (lower.includes("hr") || lower.includes("recruit")) {
    return ["People", "Culture"];
  }
  return ["Collaboration"];
}