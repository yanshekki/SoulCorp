import { useEffect } from "react";
import { applyDesignPreset, getVisualDesign, saveVisualDesign } from "../../services/visualDesignClient";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  applyAgentsVisualDesign,
  applyBuildingsVisualDesign,
} from "../../utils/applyVisualDesign";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { AgentDesignPanel } from "./AgentDesignPanel";
import { BuildingDesignPanel } from "./BuildingDesignPanel";
import { CampusDesignPanel } from "./CampusDesignPanel";
import { DesignCategoryNav } from "./DesignCategoryNav";
import { DesignPresetPicker } from "./DesignPresetPicker";
import { DesignPreviewViewport } from "./DesignPreviewViewport";
import { OfficeDesignPanel } from "./OfficeDesignPanel";

export function DesignStudioPage() {
  const category = useDesignStudioStore((state) => state.category);
  const draft = useDesignStudioStore((state) => state.draft);
  const dirty = useDesignStudioStore((state) => state.dirty);
  const saving = useDesignStudioStore((state) => state.saving);
  const setDraft = useDesignStudioStore((state) => state.setDraft);
  const setCategory = useDesignStudioStore((state) => state.setCategory);
  const setDirty = useDesignStudioStore((state) => state.setDirty);
  const setSaving = useDesignStudioStore((state) => state.setSaving);
  const setSelectedAgentId = useDesignStudioStore((state) => state.setSelectedAgentId);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setVisualDesign = useGameStore((state) => state.setVisualDesign);
  const buildings = useGameStore((state) => state.buildings);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const agents = useGameStore((state) => state.agents);
  const setBuildings = useGameStore((state) => state.setBuildings);
  const setAgents = useGameStore((state) => state.setAgents);

  useEffect(() => {
    void getVisualDesign()
      .then((design) => setDraft(design))
      .catch(() => setDraft(useGameStore.getState().visualDesign));
  }, [activeCompanyId, setDraft]);

  useEffect(() => {
    if (agentRecords[0]) {
      setSelectedAgentId(agentRecords[0].id);
    } else if (agents[0]) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agentRecords, agents, setSelectedAgentId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveVisualDesign(draft);
      setDraft(saved);
      setVisualDesign(saved);
      setBuildings(applyBuildingsVisualDesign(buildings, saved));
      setAgents(applyAgentsVisualDesign(agents, saved));
      setDirty(false);
      setStatusMessage("3D design saved for this company.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSaving(false);
    }
  };

  const handlePreset = async (presetId: string) => {
    if (presetId === "default") {
      setSaving(true);
      try {
        const saved = await applyDesignPreset("default");
        setDraft(saved);
        setDirty(true);
      } catch (error) {
        setStatusMessage(String(error));
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      const saved = await applyDesignPreset(presetId);
      setDraft(saved);
      setVisualDesign(saved);
      setBuildings(applyBuildingsVisualDesign(buildings, saved));
      setAgents(applyAgentsVisualDesign(agents, saved));
      setDirty(false);
      setStatusMessage(`Applied preset: ${presetId}`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="design-studio-page">
      <header className="design-studio-header">
        <div>
          <p className="modal-eyebrow">3D Design Studio</p>
          <h2>Design your company world</h2>
          <p className="muted">
            Customize campus theme, department buildings, office interiors, and agent appearances.
          </p>
        </div>
        <div className="design-studio-header-actions">
          <button
            type="button"
            onClick={() => void reloadGameState()}
            disabled={saving}
          >
            Reload
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? "Saving..." : dirty ? "Save design" : "Saved"}
          </button>
        </div>
      </header>

      <div className="design-studio-layout">
        <aside className="design-studio-sidebar">
          <DesignCategoryNav active={category} onChange={setCategory} />
          <DesignPresetPicker onSelect={(presetId) => void handlePreset(presetId)} compact />
        </aside>

        <main className="design-studio-main">
          <DesignPreviewViewport />
        </main>

        <aside className="design-studio-editor">
          {category === "campus" ? <CampusDesignPanel /> : null}
          {category === "buildings" ? <BuildingDesignPanel /> : null}
          {category === "offices" ? <OfficeDesignPanel /> : null}
          {category === "agents" ? <AgentDesignPanel /> : null}
        </aside>
      </div>
    </div>
  );
}