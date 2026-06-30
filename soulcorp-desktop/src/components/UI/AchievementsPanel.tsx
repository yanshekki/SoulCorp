import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { AchievementSnapshot } from "../../types/game";

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

  return (
    <section className="panel-card achievements-panel">
      <h2>Achievements</h2>
      <div className="achievement-list">
        {achievements.map((achievement) => (
          <article
            key={achievement.id}
            className={achievement.unlocked ? "achievement unlocked" : "achievement"}
          >
            <strong>{achievement.title}</strong>
            <p>{achievement.description}</p>
          </article>
        ))}
      </div>
      <h3>Endings</h3>
      <div className="achievement-list">
        {endings.map((ending) => (
          <article
            key={ending.id}
            className={ending.unlocked ? "achievement unlocked ending" : "achievement ending"}
          >
            <strong>{ending.title}</strong>
            <p>{ending.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}