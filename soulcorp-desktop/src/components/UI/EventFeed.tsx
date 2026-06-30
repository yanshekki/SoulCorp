import { useGameStore } from "../../stores/gameStore";

export function EventFeed() {
  const events = useGameStore((state) => state.events);

  if (events.length === 0) {
    return null;
  }

  return (
    <section className="event-feed">
      <h3>Recent Events</h3>
      {events.slice(0, 3).map((event) => (
        <article key={event.id} className={`event-card tone-${event.tone}`}>
          <strong>{event.title}</strong>
          <p>{event.description}</p>
        </article>
      ))}
    </section>
  );
}