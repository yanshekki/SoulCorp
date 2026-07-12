import { invoke } from "../../utils/tauriInvoke";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import type { ForesightEvent, GameEvent } from "../../types/game";
import { EVENT_FEED_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "./PaginationBar";
import { SearchableListToolbar } from "./SearchableListToolbar";
import { useI18n } from "../../i18n/I18nProvider";

const EVENT_PAGE_SIZE = 5;

export function EventFeed() {
  const { t } = useI18n();
  const events = useGameStore((state) => state.events);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const settings = useGameStore((state) => state.settings);
  const [foresight, setForesight] = useState<ForesightEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
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
      filterByScopedQuery(events, debouncedQuery, searchType, {
        all: (event: GameEvent) => [
          event.title,
          event.description,
          event.narrator ?? "",
          event.tone,
        ],
        title: (event: GameEvent) => [event.title, event.narrator ?? ""],
        body: (event: GameEvent) => [event.description],
        kind: (event: GameEvent) => [event.tone],
      }),
    [events, debouncedQuery, searchType],
  );

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredEvents, listPage, EVENT_PAGE_SIZE),
    [filteredEvents, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [debouncedQuery, searchType, events.length]);

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
                {t("events.dayTitle", { day: preview.expected_day, title: preview.title })}
              </strong>
              <p>{preview.description}</p>
              <span className="foresight-meta">
                {t("events.foresightMeta", {
                  pct: (preview.confidence * 100).toFixed(0),
                  delta: `${preview.cash_delta >= 0 ? "+" : ""}${preview.cash_delta.toFixed(0)}`,
                })}
              </span>
            </article>
          ))}
        </div>
      ) : null}
      {events.length > 0 ? (
        <>
          <h3>{t("events.recent")}</h3>
          <SearchableListToolbar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder={t("events.searchPlaceholder")}
            ariaLabel={t("events.searchAria")}
            matchCount={
              debouncedQuery.trim() || searchType !== SEARCH_TYPE_ALL
                ? filteredEvents.length
                : undefined
            }
            totalCount={events.length}
            typeFilter={{
              value: searchType,
              onChange: setSearchType,
              options: EVENT_FEED_SEARCH_TYPES,
              ariaLabel: t("events.filterAria"),
              label: t("events.filterField"),
            }}
          />
          {debouncedQuery.trim() && filteredEvents.length === 0 ? (
            <p className="search-empty-hint muted">{t("events.noMatches", { query: debouncedQuery })}</p>
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
                label={t("events.pagination")}
                onPageChange={setListPage}
              />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}