import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { useI18n } from "../../../i18n/I18nProvider";

interface AgentActivityPillProps {
  agentId: string;
  onClick?: () => void;
}

export function AgentActivityPill({ agentId, onClick }: AgentActivityPillProps) {
  const { t } = useI18n();
  const sessions = useAgentActivityStore((state) => state.sessions);
  const active = sessions.some(
    (session) => session.agent_id === agentId && session.status === "active",
  );

  if (!active) {
    return null;
  }

  return (
    <button
      type="button"
      className="observatory-live-pill"
      onClick={onClick}
      title={t("observatory.pill.thinking")}
    >
      <span className="observatory-live-dot" aria-hidden="true" />
      {t("observatory.liveBadge")}
    </button>
  );
}