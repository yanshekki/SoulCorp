import { useMemo } from "react";
import { useGameStore } from "../../../stores/gameStore";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { useAutopilotSnapshot } from "../../../hooks/useAutopilotSnapshot";

export function ObservatoryGlobalPill() {
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const { snapshot } = useAutopilotSnapshot();
  const activeCount = useMemo(
    () => sessions.filter((session) => session.status === "active").length,
    [sessions],
  );

  const autopilotActive =
    snapshot &&
    !snapshot.execution_paused &&
    snapshot.worker_enabled &&
    snapshot.phase !== "bootstrap";

  if (activeCount === 0 && !autopilotActive) {
    return null;
  }

  if (autopilotActive && activeCount === 0) {
    return (
      <button
        type="button"
        className="observatory-live-pill observatory-global-pill autopilot-status-pill"
        onClick={() => setActivePanel("projects")}
        title="Open Autopilot Command Center"
      >
        <span className="observatory-live-dot" aria-hidden="true" />
        Phase: {snapshot.phase_label}
        {snapshot.counts.active_agents > 0
          ? ` · ${snapshot.counts.active_agents} agent${snapshot.counts.active_agents === 1 ? "" : "s"} live`
          : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="observatory-live-pill observatory-global-pill"
      onClick={() => setActivePanel("observatory")}
      title="Open Observatory"
    >
      <span className="observatory-live-dot" aria-hidden="true" />
      {autopilotActive ? (
        <>
          {snapshot.phase_label}
          {" · "}
        </>
      ) : null}
      {activeCount} agent{activeCount === 1 ? "" : "s"} thinking
    </button>
  );
}