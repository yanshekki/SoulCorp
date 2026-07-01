import { useEffect, useState } from "react";
import { audioDirector } from "../../audio/AudioDirector";
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
import { InteriorDesignViewport } from "./InteriorDesignViewport";
import { OfficeFloorPlanEditor } from "./OfficeFloorPlanEditor";
import {
  OfficeBuildToolbar,
  type OfficeDesignStep,
  type OfficeDrawerTab,
  type OfficeWorkspaceView,
} from "./OfficeBuildToolbar";
import { OfficeInspectorPanel } from "./OfficeInspectorPanel";

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

  const [drawerOpen, setDrawerOpen] = useState(category !== "offices");
  const [railCollapsed, setRailCollapsed] = useState(true);
  const [officeDrawerTab, setOfficeDrawerTab] = useState<OfficeDrawerTab>("room");
  const [officeActiveStep, setOfficeActiveStep] = useState<OfficeDesignStep>("size");
  const [officeWorkspaceView, setOfficeWorkspaceView] = useState<OfficeWorkspaceView>("plan");

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

  useEffect(() => {
    const state = useGameStore.getState();
    if (state.worldView === "interior") {
      state.exitInterior();
    }
  }, []);

  useEffect(() => {
    setRailCollapsed(true);
    if (category === "offices") {
      setDrawerOpen(true);
      setOfficeActiveStep("size");
      setOfficeWorkspaceView("plan");
      setOfficeDrawerTab("room");
      return;
    }
    setDrawerOpen(true);
  }, [category]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveVisualDesign(draft);
      setDraft(saved);
      setVisualDesign(saved);
      setBuildings(applyBuildingsVisualDesign(buildings, saved));
      setAgents(applyAgentsVisualDesign(agents, saved));
      setDirty(false);
      audioDirector.playSfx("save_success");
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

  const renderDrawerContent = () => {
    if (category === "campus") {
      return <CampusDesignPanel />;
    }
    if (category === "buildings") {
      return <BuildingDesignPanel />;
    }
    if (category === "agents") {
      return <AgentDesignPanel />;
    }
    if (category === "offices") {
      return (
        <OfficeInspectorPanel
          activeStep={officeActiveStep}
          drawerTab={officeDrawerTab}
          onDrawerTabChange={setOfficeDrawerTab}
        />
      );
    }
    return null;
  };

  const editorPanelLabel =
    category === "campus"
      ? "Campus theme"
      : category === "buildings"
        ? "Building style"
        : category === "agents"
          ? "Agent appearance"
          : "Office editor";

  return (
    <div className={`design-studio-page${category === "offices" ? " design-studio-page--offices" : ""}`}>
      <header className="design-studio-header">
        <div>
          <p className="modal-eyebrow">3D Design Studio</p>
          <h2>{category === "offices" ? "Office build mode" : "Design your company world"}</h2>
          <p className="muted">
            {category === "offices"
              ? "Split plan + 3D · place furniture, resize rooms, apply StartupWarm theme"
              : "Customize campus theme, department buildings, office interiors, and agent appearances."}
          </p>
        </div>
        <div className="design-studio-header-actions">
          <button type="button" onClick={() => void reloadGameState()} disabled={saving}>
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
        <main className="design-studio-main">
          {category === "offices" ? (
            <div className="design-office-stage">
              <OfficeBuildToolbar
                workspaceView={officeWorkspaceView}
                activeStep={officeActiveStep}
                onWorkspaceViewChange={setOfficeWorkspaceView}
                onActiveStepChange={setOfficeActiveStep}
                onDrawerTabChange={setOfficeDrawerTab}
                onDrawerOpenChange={setDrawerOpen}
              />
              <div
                className={`design-office-workspace design-office-workspace--${officeWorkspaceView}`}
              >
                {officeWorkspaceView !== "3d" ? <OfficeFloorPlanEditor /> : null}
                {officeWorkspaceView !== "plan" ? (
                  <InteriorDesignViewport compact={officeWorkspaceView === "split"} />
                ) : null}
              </div>
            </div>
          ) : (
            <DesignPreviewViewport />
          )}
        </main>

        <div className="design-studio-right-chrome" data-drawer-open={drawerOpen ? "true" : "false"}>
          <aside
            className={`design-studio-drawer${drawerOpen ? " open" : ""}`}
            aria-label="Design editor"
            aria-hidden={!drawerOpen}
          >
            {renderDrawerContent()}
          </aside>
          <div className="design-studio-right-controls">
            {category !== "offices" && !drawerOpen ? (
              <button
                type="button"
                className="design-edit-fab"
                onClick={() => setDrawerOpen(true)}
                aria-label={`Open ${editorPanelLabel}`}
                title={`Edit — ${editorPanelLabel}`}
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              className={`design-drawer-toggle${drawerOpen ? " open" : ""}`}
              onClick={() => setDrawerOpen((value) => !value)}
              aria-expanded={drawerOpen}
              aria-label={drawerOpen ? "Hide editor panel" : "Show editor panel"}
              title={drawerOpen ? "Hide editor" : editorPanelLabel}
            >
              {drawerOpen ? "›" : "‹"}
            </button>
          </div>
        </div>

        <div className="design-studio-left-chrome" data-rail-open={railCollapsed ? "false" : "true"}>
          {railCollapsed ? (
            <button
              type="button"
              className="design-studio-rail-expand-tab"
              onClick={() => setRailCollapsed(false)}
              aria-label="Show categories and presets"
              title="Categories & presets"
            >
              ›
            </button>
          ) : (
            <>
              <button
                type="button"
                className="design-studio-rail-backdrop"
                onClick={() => setRailCollapsed(true)}
                aria-label="Hide categories and presets"
              />
              <aside className="design-studio-rail design-studio-rail--drawer" aria-label="Design categories">
                <button
                  type="button"
                  className="design-studio-rail-collapse-btn"
                  onClick={() => setRailCollapsed(true)}
                  aria-label="Hide categories and presets"
                  title="Hide categories and presets"
                >
                  ‹
                </button>
                <DesignCategoryNav active={category} onChange={setCategory} compact />
                <DesignPresetPicker onSelect={(presetId) => void handlePreset(presetId)} compact />
              </aside>
            </>
          )}
        </div>
      </div>
    </div>
  );
}