import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BuildingModal } from "./components/BuildingModal";
import { GameScene } from "./components/GameScene";
import { CompanySetupGate } from "./components/UI/CompanySetupGate";
import { CreateCompanyModal } from "./components/UI/CreateCompanyModal";
import { OnboardingWizard } from "./components/UI/OnboardingWizard";
import { ShellLayout } from "./components/UI/ShellLayout";
import { DesignStudioPage } from "./components/design/DesignStudioPage";
import { AchievementsPage } from "./components/UI/AchievementsPage";
import { AgentsPage } from "./components/UI/AgentsPage";
import { ObservatoryPage } from "./components/UI/ObservatoryPage";
import { DepartmentsPage } from "./components/UI/departments/DepartmentsPage";
import { MarketplacePage } from "./components/UI/MarketplacePage";
import { TokensPage } from "./components/UI/TokensPage";
import { RecruitmentPage } from "./components/UI/RecruitmentPage";
import { MeetingPage } from "./components/UI/MeetingPage";
import { ProjectsPage } from "./components/UI/ProjectsPage";

import { GodModePage } from "./components/UI/GodModePage";
import { SettingsPage } from "./components/UI/SettingsPage";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell";
import { LoadingOverlay } from "./components/UI/LoadingOverlay";
import {
  showAchievements,
  showBuildingModal,
  showDesignStudio,
  showGodMode,
  showOffice3D,
} from "./config/features";
import { useGameAudio } from "./hooks/useGameAudio";
import { useGameBootstrap } from "./hooks/useGameBootstrap";
import { useOperationProgress } from "./hooks/useOperationProgress";
import { useSimulationLoop } from "./hooks/useSimulationLoop";
import { useScrumWorkerSync } from "./hooks/useScrumWorkerSync";
import { useAgentActivity } from "./hooks/useAgentActivity";
import { useGameStore } from "./stores/gameStore";
import type { SidebarPanel } from "./types/game";
import { hasActiveCompany } from "./utils/companyState";
import "./App.css";
import "./styles/design-system.css";
import "./styles/workspace-editor.css";
import "./styles/startup-warm-ui.css";

const GAME_SCENE_PANELS = new Set<SidebarPanel>(showOffice3D ? ["office"] : []);
const WEBGL_STAGE_PANELS = new Set<SidebarPanel>(
  showOffice3D ? ["office", ...(showDesignStudio ? (["design_studio"] as SidebarPanel[]) : [])] : [],
);

function App() {
  const statusMessage = useGameStore((state) => state.statusMessage);
  const activePanel = useGameStore((state) => state.activePanel);
  const onboardingCompleted = useGameStore((state) => state.onboardingCompleted);
  const onboardingReady = useGameStore((state) => state.onboardingReady);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const companies = useGameStore((state) => state.companies);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [stageReady, setStageReady] = useState(true);
  const prevPanelRef = useRef(activePanel);

  const companyReady = hasActiveCompany(activeCompanyId, companies);

  useEffect(() => {
    const previous = prevPanelRef.current;
    prevPanelRef.current = activePanel;
    if (WEBGL_STAGE_PANELS.has(previous) && !WEBGL_STAGE_PANELS.has(activePanel)) {
      setStageReady(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setStageReady(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setStageReady(true);
  }, [activePanel]);

  useGameBootstrap();
  useGameAudio();
  useOperationProgress();
  useSimulationLoop();
  useScrumWorkerSync();
  useAgentActivity();

  useEffect(() => {
    invoke<string>("get_app_status")
      .then((message) => setStatusMessage(message))
      .catch((error) => setStatusMessage(String(error)));
  }, [setStatusMessage]);

  let content: ReactNode;

  if (!onboardingReady) {
    content = (
      <div className="app-loading-screen">
        <p>Loading SoulCorp...</p>
      </div>
    );
  } else if (!onboardingCompleted) {
    content = <OnboardingWizard />;
  } else if (!companyReady) {
    content = <CompanySetupGate />;
  } else {
    content = (
      <>
        <ShellLayout statusMessage={statusMessage}>
          {!stageReady ? (
            <div className="app-stage-transition" aria-hidden="true" />
          ) : activePanel === "workspace" ? (
            <WorkspaceShell />
          ) : activePanel === "meeting" ? (
            <MeetingPage />
          ) : activePanel === "projects" ? (
            <ProjectsPage />
          ) : showDesignStudio && activePanel === "design_studio" ? (
            <DesignStudioPage />
          ) : activePanel === "settings" ? (
            <SettingsPage />
          ) : showGodMode && activePanel === "god_mode" ? (
            <GodModePage />
          ) : showAchievements && activePanel === "achievements" ? (
            <AchievementsPage />
          ) : activePanel === "departments" ? (
            <DepartmentsPage />
          ) : activePanel === "agents" ? (
            <AgentsPage />
          ) : activePanel === "observatory" ? (
            <ObservatoryPage />
          ) : activePanel === "recruitment" ? (
            <RecruitmentPage />
          ) : activePanel === "marketplace" ? (
            <MarketplacePage />
          ) : activePanel === "finance" ? (
            <TokensPage />
          ) : GAME_SCENE_PANELS.has(activePanel) ? (
            <GameScene />
          ) : (
            <div className="app-stage-placeholder">
              <p className="muted">
                Open <strong>Workspace</strong> or another section from the top navigation.
              </p>
            </div>
          )}
        </ShellLayout>
        {showBuildingModal ? <BuildingModal /> : null}
        <CreateCompanyModal />
      </>
    );
  }

  return (
    <>
      {content}
      <LoadingOverlay />
    </>
  );
}

export default App;