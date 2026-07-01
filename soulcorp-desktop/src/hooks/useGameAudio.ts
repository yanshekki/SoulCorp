import { useEffect, useRef } from "react";
import { audioDirector } from "../audio/AudioDirector";
import { useGameStore } from "../stores/gameStore";
import { isNightCampus } from "../components/world/sceneTheme";
import { DEFAULT_CAMPUS_THEME } from "../types/visualDesign";

export function useGameAudio(): void {
  const settings = useGameStore((state) => state.settings);
  const worldView = useGameStore((state) => state.worldView);
  const activePanel = useGameStore((state) => state.activePanel);
  const visualDesign = useGameStore((state) => state.visualDesign);
  const hoveredDoor = useGameStore((state) => state.hoveredDoorBuildingId);
  const buildMode = useGameStore((state) => state.buildMode);
  const prevHoverRef = useRef<string | null>(null);

  useEffect(() => {
    const unlock = () => {
      audioDirector.unlock();
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const musicOn = settings.music_enabled ?? true;
    const sfxOn = settings.sfx_enabled ?? true;
    audioDirector.setMusicEnabled(musicOn);
    audioDirector.setSfxEnabled(sfxOn);
    audioDirector.setMusicVolume(settings.music_volume ?? 0.25);
    audioDirector.setSfxVolume(settings.sfx_volume ?? 0.45);
    if (!musicOn && !sfxOn) {
      audioDirector.muteAll();
    }
  }, [
    settings.music_enabled,
    settings.sfx_enabled,
    settings.music_volume,
    settings.sfx_volume,
  ]);

  useEffect(() => {
    if (activePanel === "design_studio") {
      audioDirector.playBgm("studio");
      return;
    }
    if (worldView === "interior" && buildMode === "build") {
      audioDirector.playBgm("build");
      return;
    }
    if (worldView === "interior") {
      audioDirector.playBgm("interior");
      return;
    }
    const campus = visualDesign.campus ?? DEFAULT_CAMPUS_THEME;
    const track = isNightCampus(campus) ? "campus_night" : "campus_day";
    audioDirector.playBgm(track);
  }, [activePanel, buildMode, worldView, visualDesign.campus]);

  useEffect(() => {
    if (!audioDirector.isUnlocked()) {
      prevHoverRef.current = hoveredDoor;
      return;
    }
    if (hoveredDoor && hoveredDoor !== prevHoverRef.current) {
      audioDirector.playSfx("door_hover");
    }
    prevHoverRef.current = hoveredDoor;
  }, [hoveredDoor]);
}