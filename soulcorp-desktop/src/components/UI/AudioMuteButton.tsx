import { useGameStore } from "../../stores/gameStore";
import { setAudioMuted } from "../../hooks/useAudioSettings";

interface AudioMuteButtonProps {
  className?: string;
  showLabel?: boolean;
}

export function AudioMuteButton({ className = "audio-mute-btn", showLabel = false }: AudioMuteButtonProps) {
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
    ? "Turn sound on"
    : partiallyMuted
      ? "Mute all sound"
      : "Mute all sound";

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
      {showLabel ? <span>{fullyMuted ? "Sound off" : "Sound on"}</span> : null}
    </button>
  );
}