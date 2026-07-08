import { useMemo } from "react";
import { useGameStore } from "../../../stores/gameStore";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";

export function ObservatoryGlobalPill() {
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const activeCount = useMemo(
    () => sessions.filter((session) => session.status === "active").length,
    [sessions],
  );

  if (activeCount === 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="observatory-live-pill observatory-global-pill"
      onClick={() => setActivePanel("observatory")}
      title="Open Observatory"
    >
      <span className="observatory-live-dot" aria-hidden="true" />
      {activeCount} agent{activeCount === 1 ? "" : "s"} thinking
    </button>
  );
}