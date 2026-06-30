import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { Achievement, AchievementSnapshot } from "../../types/game";

const CATEGORY_LABELS: Record<string, string> = {
  growth: "Growth",
  culture: "Culture",
  productivity: "Productivity",
  offline: "Offline",
  god_mode: "God Mode",
  chaos: "Chaos",
  economic: "Economic",
};

function groupByCategory(items: Achievement[]) {
  const groups = new Map<string, Achievement[]>();
  for (const item of items) {
    const current = groups.get(item.category) ?? [];
    current.push(item);
    groups.set(item.category, current);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

export function AchievementsPanel() {
  const achievements = useGameStore((state) => state.achievements);
  const endings = useGameStore((state) => state.endings);
  const setAchievements = useGameStore((state) => state.setAchievements);
  const setEndings = useGameStore((state) => state.setEndings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    invoke<AchievementSnapshot>("get_achievements")
      .then((snapshot) => {
        setAchievements(snapshot.achievements);
        setEndings(snapshot.endings);
        if (snapshot.newly_unlocked.length > 0) {
          setStatusMessage(`Unlocked: ${snapshot.newly_unlocked.join(", ")}`);
        }
      })
      .catch((error) => setStatusMessage(String(error)));
  }, [setAchievements, setEndings, setStatusMessage]);

  const unlockedCount = useMemo(
    () => achievements.filter((achievement) => achievement.unlocked).length,
    [achievements],
  );
  const groupedAchievements = useMemo(() => groupByCategory(achievements), [achievements]);
  const unlockedEndings = useMemo(
    () => endings.filter((ending) => ending.unlocked).length,
    [endings],
  );

  return (
    <section className="panel-card achievements-panel">
      <h2>Achievements</h2>
      <p className="achievement-progress muted">
        {unlockedCount}/{achievements.length} achievements · {unlockedEndings}/{endings.length}{" "}
        endings
      </p>

      {groupedAchievements.map(([category, items]) => (
        <div key={category} className="achievement-category">
          <h3>{CATEGORY_LABELS[category] ?? category}</h3>
          <div className="achievement-list">
            {items.map((achievement) => (
              <article
                key={achievement.id}
                className={achievement.unlocked ? "achievement unlocked" : "achievement"}
              >
                <strong>{achievement.title}</strong>
                <p>{achievement.description}</p>
                {achievement.unlocked && achievement.unlocked_at ? (
                  <span className="achievement-date muted">
                    Unlocked {new Date(achievement.unlocked_at).toLocaleDateString()}
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ))}

      <h3>Endings</h3>
      <div className="achievement-list endings-list">
        {endings.map((ending) => (
          <article
            key={ending.id}
            className={ending.unlocked ? "achievement unlocked ending" : "achievement ending"}
          >
            <strong>{ending.title}</strong>
            <p>{ending.description}</p>
            {ending.unlocked && ending.unlocked_at ? (
              <span className="achievement-date muted">
                Unlocked {new Date(ending.unlocked_at).toLocaleDateString()}
              </span>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}