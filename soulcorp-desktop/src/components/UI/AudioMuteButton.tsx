import { useGameStore } from "../../stores/gameStore";
import { setAudioMuted } from "../../hooks/useAudioSettings";
import { useI18n } from "../../i18n/I18nProvider";

interface AudioMuteButtonProps {
  className?: string;
  showLabel?: boolean;
}

export function AudioMuteButton({ className = "audio-mute-btn", showLabel = false }: AudioMuteButtonProps) {
  const { t } = useI18n();
  const settings = useGameStore((state) => state.settings);
  const musicOn = settings.music_enabled ?? true;
  const sfxOn = settings.sfx_enabled ?? true;
  const fullyMuted = !musicOn && !sfxOn;
  const partiallyMuted = !fullyMuted && (!musicOn || !sfxOn);

  const toggle = () => {
    void setAudioMuted(!fullyMuted);
  };

  const icon = fullyMuted ? "🔇" : partiallyMuted ? "🔉" : "🔊";
  const title = fullyMuted
    ? t("audio.unmute")
    : partiallyMuted
      ? t("audio.muteAll")
      : t("audio.muteAll");

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      title={title}
      aria-label={title}
      aria-pressed={fullyMuted}
    >
      <span aria-hidden="true">{icon}</span>
      {showLabel ? <span>{fullyMuted ? t("audio.soundOff") : t("audio.soundOn")}</span> : null}
    </button>
  );
}