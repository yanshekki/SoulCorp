import { useGameStore } from "../../stores/gameStore";

export function PauseMenu() {
  const isPaused = useGameStore((state) => state.isPaused);
  const togglePause = useGameStore((state) => state.togglePause);

  if (!isPaused) {
    return null;
  }

  return (
    <div className="pause-overlay" role="dialog" aria-modal="true">
      <div className="pause-menu">
        <h2>Paused</h2>
        <p>The office simulation is on hold.</p>
        <button type="button" onClick={togglePause}>
          Resume
        </button>
      </div>
    </div>
  );
}