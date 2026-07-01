import { useGameStore } from "../../stores/gameStore";
import { useProgressStore } from "../../stores/progressStore";

export function OfflineStatusBar() {
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const simTickLabel = useProgressStore((state) => state.simTickLabel);
  const simTickPercent = useProgressStore((state) => state.simTickPercent);
  const tickInFlight = useProgressStore((state) => state.tickInFlight);

  const cloudEnabled = !settings.pure_local_mode;
  const eventsLabel = settings.random_events_enabled
    ? settings.event_mode === "serious"
      ? "Serious mode"
      : "Events on"
    : "Events off";

  return (
    <div className="offline-status-bar" aria-label="Offline capabilities">
      <span className={`offline-pill ${settings.pure_local_mode ? "pure-local" : "hybrid"}`}>
        {settings.pure_local_mode ? "Pure Local" : "Hybrid"}
      </span>
      <span className={`offline-pill ${cloudEnabled && hubStatus.connected ? "online" : "offline"}`}>
        {cloudEnabled ? (hubStatus.connected ? "Hub connected" : "Hub offline") : "Cloud disabled"}
      </span>
      <span className="offline-pill muted">{eventsLabel}</span>
      {settings.low_power_mode ? (
        <span className="offline-pill performance">Low power</span>
      ) : null}
      {settings.backup_interval_minutes > 0 ? (
        <span className="offline-pill backup">
          Auto-backup {settings.backup_interval_minutes}m
        </span>
      ) : null}
      {tickInFlight && simTickLabel ? (
        <span className="sim-tick-pill" aria-live="polite">
          {simTickLabel}
          {simTickPercent !== null ? ` ${Math.round(simTickPercent)}%` : ""}
        </span>
      ) : null}
    </div>
  );
}