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
import { useI18n } from "../../i18n/I18nProvider";

export function DesignPreviewViewport() {
  const { t } = useI18n();
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
    if (state.worldView === "interior") {
      state.exitInterior();
    }

    return () => {
      setBuildings(baseBuildingsRef.current);
      setAgents(baseAgentsRef.current);
    };
  }, [setAgents, setBuildings]);

  useEffect(() => {
    setBuildings(applyBuildingsVisualDesign(baseBuildingsRef.current, draft));
    setAgents(applyAgentsVisualDesign(baseAgentsRef.current, draft));
    useGameStore.getState().setVisualDesign(draft);
    setSkyStyle(campusSkyGradient(draft));
  }, [draft, setAgents, setBuildings]);

  return (
    <div className="design-preview-viewport" ref={containerRef}>
      <div className="design-preview-sky" style={{ background: skyStyle }} />
      <GameScene />
      <p className="design-preview-hint">
        {t("design.previewHint")}
      </p>
    </div>
  );
}