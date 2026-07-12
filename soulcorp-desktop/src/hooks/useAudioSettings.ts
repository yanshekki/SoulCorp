import { invoke } from "../utils/tauriInvoke";
import { audioDirector } from "../audio/AudioDirector";
import { useGameStore } from "../stores/gameStore";
import type { GameSettings } from "../types/game";

export async function patchAudioSettings(patch: Partial<GameSettings>): Promise<GameSettings> {
  const next = await invoke<GameSettings>("update_game_settings", {
    update: {
      music_enabled: patch.music_enabled,
      music_volume: patch.music_volume,
      sfx_enabled: patch.sfx_enabled,
      sfx_volume: patch.sfx_volume,
    },
  });
  useGameStore.getState().setSettings(next);
  return next;
}

export function isAudioMuted(settings: GameSettings): boolean {
  return !(settings.music_enabled ?? true) && !(settings.sfx_enabled ?? true);
}

export async function setAudioMuted(muted: boolean): Promise<void> {
  await patchAudioSettings({
    music_enabled: !muted,
    sfx_enabled: !muted,
  });
  if (muted) {
    audioDirector.muteAll();
  }
}