import { useEffect, useRef, useState } from "react";
import { GameScene } from "../GameScene";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  applyAgentsVisualDesign,
  applyBuildingsVisualDesign,
  campusSkyGradient,
} from "../../utils/applyVisualDesign";
import type { Agent, Building } from "../../types/world";

export function DesignPreviewViewport() {
  const draft = useDesignStudioStore((state) => state.draft);
  const setBuildings = useGameStore((state) => state.setBuildings);
  const setAgents = useGameStore((state) => state.setAgents);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseBuildingsRef = useRef<Building[]>([]);
  const baseAgentsRef = useRef<Agent[]>([]);
  const [skyStyle, setSkyStyle] = useState(campusSkyGradient(draft));

  useEffect(() => {
    const state = useGameStore.getState();
    baseBuildingsRef.current = state.buildings;
    baseAgentsRef.current = state.agents;
  }, []);

  useEffect(() => {
    setBuildings(applyBuildingsVisualDesign(baseBuildingsRef.current, draft));
    setAgents(applyAgentsVisualDesign(baseAgentsRef.current, draft));
    setSkyStyle(campusSkyGradient(draft));
  }, [draft, setAgents, setBuildings]);

  return (
    <div className="design-preview-viewport" ref={containerRef}>
      <div className="design-preview-sky" style={{ background: skyStyle }} />
      <GameScene />
      <p className="design-preview-hint">Live 3D preview — orbit by selecting buildings in Office view later.</p>
    </div>
  );
}