import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { ForesightEvent } from "../../types/game";

export function EventFeed() {
  const events = useGameStore((state) => state.events);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const settings = useGameStore((state) => state.settings);
  const [foresight, setForesight] = useState<ForesightEvent[]>([]);

  useEffect(() => {
    if (
      settings.play_mode === "work" ||
      !settings.random_events_enabled ||
      tierBenefits.event_foresight_days === 0
    ) {
      setForesight([]);
      return;
    }
    invoke<ForesightEvent[]>("get_event_foresight")
      .then(setForesight)
      .catch(() => setForesight([]));
  }, [
    settings.play_mode,
    settings.random_events_enabled,
    settings.random_event_chance,
    tierBenefits.event_foresight_days,
    events.length,
  ]);

  if (settings.play_mode === "work") {
    return null;
  }

  if (events.length === 0 && foresight.length === 0) {
    return null;
  }

  return (
    <section className="event-feed">
      {foresight.length > 0 ? (
        <div className="foresight-block">
          <h3>Fate Foresight ({tierBenefits.event_foresight_days}d)</h3>
          {foresight.map((preview) => (
            <article key={preview.id} className={`event-card tone-${preview.tone} foresight-card`}>
              <strong>
                Day {preview.expected_day}: {preview.title}
              </strong>
              <p>{preview.description}</p>
              <span className="foresight-meta">
                {(preview.confidence * 100).toFixed(0)}% confidence · tokens{" "}
                {preview.cash_delta >= 0 ? "+" : ""}
                {preview.cash_delta.toFixed(0)}
              </span>
            </article>
          ))}
        </div>
      ) : null}
      {events.length > 0 ? (
        <>
          <h3>Recent Events</h3>
          {events.slice(0, 3).map((event) => (
            <article key={event.id} className={`event-card tone-${event.tone}`}>
              <strong>
                {event.narrator ? `${event.narrator} · ` : ""}
                {event.title}
              </strong>
              <p>{event.description}</p>
            </article>
          ))}
        </>
      ) : null}
    </section>
  );
}