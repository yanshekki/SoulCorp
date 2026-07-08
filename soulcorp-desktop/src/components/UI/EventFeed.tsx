import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import type { ForesightEvent, GameEvent } from "../../types/game";
import { filterByQuery } from "../../utils/listSearch";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "./PaginationBar";
import { SearchableListToolbar } from "./SearchableListToolbar";

const EVENT_PAGE_SIZE = 5;

export function EventFeed() {
  const events = useGameStore((state) => state.events);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const settings = useGameStore((state) => state.settings);
  const [foresight, setForesight] = useState<ForesightEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [listPage, setListPage] = useState(0);
  const debouncedQuery = useDebouncedValue(searchQuery);

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

  const filteredEvents = useMemo(
    () =>
      filterByQuery(events, debouncedQuery, (event: GameEvent) => [
        event.title,
        event.description,
        event.narrator ?? "",
        event.tone,
      ]),
    [events, debouncedQuery],
  );

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredEvents, listPage, EVENT_PAGE_SIZE),
    [filteredEvents, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [debouncedQuery, events.length]);

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
          <SearchableListToolbar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Search events…"
            ariaLabel="Search events"
            matchCount={debouncedQuery.trim() ? filteredEvents.length : undefined}
            totalCount={events.length}
          />
          {debouncedQuery.trim() && filteredEvents.length === 0 ? (
            <p className="search-empty-hint muted">No matches for &ldquo;{debouncedQuery}&rdquo;.</p>
          ) : (
            <>
              {pageItems.map((event) => (
                <article key={event.id} className={`event-card tone-${event.tone}`}>
                  <strong>
                    {event.narrator ? `${event.narrator} · ` : ""}
                    {event.title}
                  </strong>
                  <p>{event.description}</p>
                </article>
              ))}
              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                label="Events"
                onPageChange={setListPage}
              />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}