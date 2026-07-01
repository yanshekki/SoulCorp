import { useGameStore } from "../../stores/gameStore";
import { TestModeButton } from "../UI/TestModeButton";

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function TPHStatsPanel() {
  const finance = useGameStore((state) => state.finance);
  const simulation = useGameStore((state) => state.simulation);
  const agents = useGameStore((state) => state.agents);
  const isPaused = useGameStore((state) => state.isPaused);
  const togglePause = useGameStore((state) => state.togglePause);
  const statusMessage = useGameStore((state) => state.statusMessage);

  const activeAgents = simulation.agentsActive || agents.length;

  return (
    <aside className="tph-stats-panel" aria-label="Company status">
      <div className="tph-stats-row tph-stats-row--primary">
        <div className="tph-stat tph-stat--tokens" title="Company token balance">
          <span className="tph-stat-icon" aria-hidden>
            ◈
          </span>
          <span className="tph-stat-value">{formatTokens(finance.company_balance)}</span>
          <span className="tph-stat-label">Tokens</span>
        </div>
        <div className="tph-stat tph-stat--agents" title="Active agents">
          <span className="tph-stat-icon" aria-hidden>
            👤
          </span>
          <span className="tph-stat-value">{activeAgents}</span>
          <span className="tph-stat-label">Staff</span>
        </div>
        <div className="tph-stat tph-stat--day" title="Simulation day">
          <span className="tph-stat-icon" aria-hidden>
            📅
          </span>
          <span className="tph-stat-value">D{simulation.dayNumber}</span>
          <span className="tph-stat-label">Day</span>
        </div>
      </div>
      <div className="tph-stats-row tph-stats-row--controls">
        <button
          type="button"
          className={`tph-speed-btn${isPaused ? " paused" : ""}`}
          onClick={togglePause}
          title={isPaused ? "Resume simulation" : "Pause simulation"}
        >
          {isPaused ? "▶" : "❚❚"}
        </button>
        <span className="tph-status-message" title={statusMessage}>
          {statusMessage}
        </span>
        <TestModeButton placement="floating" />
      </div>
    </aside>
  );
}