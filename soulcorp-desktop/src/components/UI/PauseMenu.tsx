import { useGameStore } from "../../stores/gameStore";
import { useI18n } from "../../i18n/I18nProvider";

export function PauseMenu() {
  const { t } = useI18n();
  const isPaused = useGameStore((state) => state.isPaused);
  const togglePause = useGameStore((state) => state.togglePause);

  if (!isPaused) {
    return null;
  }

  return (
    <div className="pause-overlay" role="dialog" aria-modal="true">
      <div className="pause-menu">
        <h2>{t("pause.title")}</h2>
        <p>{t("pause.body")}</p>
        <button type="button" onClick={togglePause}>
          {t("pause.resume")}
        </button>
      </div>
    </div>
  );
}