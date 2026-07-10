import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanyScope } from "../../hooks/useCompanyScope";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import type { Achievement, AchievementSnapshot, Ending } from "../../types/game";
import { ACHIEVEMENT_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, prefilterItems, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { SearchableListToolbar } from "./SearchableListToolbar";

export const CATEGORY_LABELS: Record<string, string> = {
  growth: "Growth",
  culture: "Culture",
  productivity: "Productivity",
  offline: "Offline",
  god_mode: "God Mode",
  chaos: "Chaos",
  economic: "Economic",
};

export const ACHIEVEMENT_NAV_SECTIONS = [
  { id: "all", label: "All" },
  ...Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label })),
  { id: "endings", label: "Endings" },
] as const;

function groupByCategory(items: Achievement[]) {
  const groups = new Map<string, Achievement[]>();
  for (const item of items) {
    const current = groups.get(item.category) ?? [];
    current.push(item);
    groups.set(item.category, current);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="achievements-stat-card">
      <div
        className="achievements-progress-ring"
        style={{ ["--progress" as string]: `${clamped}%` }}
        aria-hidden="true"
      >
        <span>{clamped}%</span>
      </div>
      <p className="achievements-stat-label">{label}</p>
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  return (
    <article
      className={`achievement achievements-card${achievement.unlocked ? " unlocked" : " locked"}`}
    >
      <div className="achievements-card-head">
        <strong>{achievement.title}</strong>
        <span className={`achievements-badge${achievement.unlocked ? " unlocked" : ""}`}>
          {achievement.unlocked ? "Unlocked" : "Locked"}
        </span>
      </div>
      <p>{achievement.description}</p>
      {achievement.unlocked && achievement.unlocked_at ? (
        <span className="achievement-date muted">
          Unlocked {new Date(achievement.unlocked_at).toLocaleDateString()}
        </span>
      ) : null}
    </article>
  );
}

function EndingCard({ ending }: { ending: Ending }) {
  return (
    <article
      className={`achievement ending achievements-card achievements-ending-card${
        ending.unlocked ? " unlocked" : " locked"
      }`}
    >
      <div className="achievements-card-head">
        <strong>{ending.title}</strong>
        <span className={`achievements-badge ending${ending.unlocked ? " unlocked" : ""}`}>
          {ending.unlocked ? "Discovered" : "Hidden"}
        </span>
      </div>
      <p>{ending.description}</p>
      {ending.unlocked && ending.unlocked_at ? (
        <span className="achievement-date muted">
          Unlocked {new Date(ending.unlocked_at).toLocaleDateString()}
        </span>
      ) : null}
    </article>
  );
}

interface AchievementsPanelProps {
  activeSection: string;
}

export function AchievementsPanel({ activeSection }: AchievementsPanelProps) {
  const { activeCompanyId, companyRevision } = useCompanyScope();
  const achievements = useGameStore((state) => state.achievements);
  const endings = useGameStore((state) => state.endings);
  const setAchievements = useGameStore((state) => state.setAchievements);
  const setEndings = useGameStore((state) => state.setEndings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const debouncedQuery = useDebouncedValue(searchQuery);

  const scopedAchievements = useMemo(
    () =>
      prefilterItems(achievements, searchType, (achievement, type) => {
        if (type === "ending") {
          return false;
        }
        if (type === "achievement" || type === SEARCH_TYPE_ALL) {
          return true;
        }
        return achievement.category === type;
      }),
    [achievements, searchType],
  );

  const scopedEndings = useMemo(
    () =>
      searchType === SEARCH_TYPE_ALL || searchType === "ending"
        ? endings
        : [],
    [endings, searchType],
  );

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    invoke<AchievementSnapshot>("get_achievements")
      .then((snapshot) => {
        setAchievements(snapshot.achievements);
        setEndings(snapshot.endings);
        if (snapshot.newly_unlocked.length > 0) {
          setStatusMessage(`Unlocked: ${snapshot.newly_unlocked.join(", ")}`);
        }
      })
      .catch((error) => setStatusMessage(String(error)));
  }, [activeCompanyId, companyRevision, setAchievements, setEndings, setStatusMessage]);

  const unlockedCount = useMemo(
    () => achievements.filter((achievement) => achievement.unlocked).length,
    [achievements],
  );
  const filteredAchievements = useMemo(
    () =>
      filterByScopedQuery(scopedAchievements, debouncedQuery, searchType, {
        all: (achievement) => [
          achievement.title,
          achievement.description,
          achievement.category,
          CATEGORY_LABELS[achievement.category] ?? achievement.category,
        ],
        achievement: (achievement) => [
          achievement.title,
          achievement.description,
          achievement.category,
          CATEGORY_LABELS[achievement.category] ?? achievement.category,
        ],
        ending: () => [],
        growth: (achievement) => [
          achievement.title,
          achievement.description,
          CATEGORY_LABELS[achievement.category] ?? achievement.category,
        ],
        culture: (achievement) => [
          achievement.title,
          achievement.description,
          CATEGORY_LABELS[achievement.category] ?? achievement.category,
        ],
        productivity: (achievement) => [
          achievement.title,
          achievement.description,
          CATEGORY_LABELS[achievement.category] ?? achievement.category,
        ],
      }),
    [scopedAchievements, debouncedQuery, searchType],
  );

  const filteredEndings = useMemo(
    () =>
      filterByScopedQuery(scopedEndings, debouncedQuery, searchType, {
        all: (ending) => [ending.title, ending.description, ending.id],
        achievement: () => [],
        ending: (ending) => [ending.title, ending.description, ending.id],
        growth: () => [],
        culture: () => [],
        productivity: () => [],
      }),
    [scopedEndings, debouncedQuery, searchType],
  );

  const groupedAchievements = useMemo(
    () => groupByCategory(filteredAchievements),
    [filteredAchievements],
  );
  const unlockedEndings = useMemo(
    () => endings.filter((ending) => ending.unlocked).length,
    [endings],
  );
  const achievementPercent =
    achievements.length > 0 ? Math.round((unlockedCount / achievements.length) * 100) : 0;
  const endingPercent = endings.length > 0 ? Math.round((unlockedEndings / endings.length) * 100) : 0;

  const categoryProgress = useMemo(() => {
    return groupedAchievements.map(([category, items]) => {
      const unlocked = items.filter((item) => item.unlocked).length;
      return {
        category,
        label: CATEGORY_LABELS[category] ?? category,
        unlocked,
        total: items.length,
        percent: items.length > 0 ? Math.round((unlocked / items.length) * 100) : 0,
      };
    });
  }, [groupedAchievements]);

  const showAll = activeSection === "all";
  const showEndings = activeSection === "endings" || showAll;
  const visibleCategories = showAll
    ? groupedAchievements
    : groupedAchievements.filter(([category]) => category === activeSection);

  return (
    <div className="achievements-panel achievements-panel--page" ref={scrollRootRef}>
      {showAll ? (
        <>
          <div className="achievements-summary" id="all" data-achievements-section="all">
            <ProgressRing
              value={achievementPercent}
              label={`${unlockedCount}/${achievements.length} achievements`}
            />
            <ProgressRing
              value={endingPercent}
              label={`${unlockedEndings}/${endings.length} endings`}
            />
            <div className="achievements-summary-copy">
              <p>
                Unlock achievements by growing the company, surviving chaos events, and mastering
                offline play. Endings reveal alternate futures for your simulation.
              </p>
            </div>
          </div>

          <SearchableListToolbar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Search achievements and endings…"
            ariaLabel="Search achievements"
            matchCount={
              debouncedQuery.trim() || searchType !== SEARCH_TYPE_ALL
                ? filteredAchievements.length + filteredEndings.length
                : undefined
            }
            totalCount={scopedAchievements.length + scopedEndings.length}
            typeFilter={{
              value: searchType,
              onChange: setSearchType,
              options: ACHIEVEMENT_SEARCH_TYPES,
              ariaLabel: "Filter achievement type",
              label: "Type",
            }}
          />

          {debouncedQuery.trim() &&
          filteredAchievements.length === 0 &&
          filteredEndings.length === 0 ? (
            <p className="search-empty-hint muted">
              No matches for &ldquo;{debouncedQuery}&rdquo;.
            </p>
          ) : null}

          <div className="achievements-category-progress">
            {categoryProgress.map((entry) => (
              <div key={entry.category} className="achievements-category-meter">
                <div className="achievements-category-meter-head">
                  <span>{entry.label}</span>
                  <span className="muted">
                    {entry.unlocked}/{entry.total}
                  </span>
                </div>
                <div className="achievements-category-meter-bar">
                  <span style={{ width: `${entry.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {visibleCategories.map(([category, items]) => (
        <section
          key={category}
          id={category}
          className="achievements-category-section"
          data-achievements-section={category}
        >
          <header className="achievements-section-header">
            <h3>{CATEGORY_LABELS[category] ?? category}</h3>
            <span className="muted">
              {items.filter((item) => item.unlocked).length}/{items.length} unlocked
            </span>
          </header>
          <div className="achievements-grid">
            {items.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        </section>
      ))}

      {showEndings ? (
        <section
          id="endings"
          className="achievements-category-section achievements-endings-section"
          data-achievements-section="endings"
        >
          <header className="achievements-section-header">
            <h3>Endings</h3>
            <span className="muted">
              {unlockedEndings}/{endings.length} discovered
            </span>
          </header>
          <div className="achievements-grid achievements-endings-grid">
            {filteredEndings.map((ending) => (
              <EndingCard key={ending.id} ending={ending} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}