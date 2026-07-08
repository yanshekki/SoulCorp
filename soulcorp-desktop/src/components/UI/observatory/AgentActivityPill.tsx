import { useAgentActivityStore } from "../../../stores/agentActivityStore";

interface AgentActivityPillProps {
  agentId: string;
  onClick?: () => void;
}

export function AgentActivityPill({ agentId, onClick }: AgentActivityPillProps) {
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
      title="Agent is thinking — open Observatory"
    >
      <span className="observatory-live-dot" aria-hidden="true" />
      LIVE
    </button>
  );
}