import { useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BuildingModal } from "./components/BuildingModal";
import { GameScene } from "./components/GameScene";
import { CompanySetupGate } from "./components/UI/CompanySetupGate";
import { CreateCompanyModal } from "./components/UI/CreateCompanyModal";
import { OnboardingWizard } from "./components/UI/OnboardingWizard";
import { ShellLayout } from "./components/UI/ShellLayout";
import { DesignStudioPage } from "./components/design/DesignStudioPage";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell";
import { LoadingOverlay } from "./components/UI/LoadingOverlay";
import { useGameAudio } from "./hooks/useGameAudio";
import { useGameBootstrap } from "./hooks/useGameBootstrap";
import { useOperationProgress } from "./hooks/useOperationProgress";
import { useSimulationLoop } from "./hooks/useSimulationLoop";
import { useGameStore } from "./stores/gameStore";
import type { SidebarPanel } from "./types/game";
import { hasActiveCompany } from "./utils/companyState";
import "./App.css";
import "./styles/design-system.css";
import "./styles/startup-warm-ui.css";

/** Only Office needs the live WebGL campus — avoids GPU churn when opening Settings etc. */
const GAME_SCENE_PANELS = new Set<SidebarPanel>(["office"]);

function InspectorStagePlaceholder() {
  return (
    <div className="app-stage-placeholder">
      <p className="muted">
        Settings and business panels use the left sidebar. Open <strong>Office</strong> for the 3D
        campus view.
      </p>
    </div>
  );
}

function App() {
  const statusMessage = useGameStore((state) => state.statusMessage);
  const activePanel = useGameStore((state) => state.activePanel);
  const onboardingCompleted = useGameStore((state) => state.onboardingCompleted);
  const onboardingReady = useGameStore((state) => state.onboardingReady);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const companies = useGameStore((state) => state.companies);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const companyReady = hasActiveCompany(activeCompanyId, companies);

  useGameBootstrap();
  useGameAudio();
  useOperationProgress();
  useSimulationLoop();

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
          {activePanel === "workspace" ? (
            <WorkspaceShell />
          ) : activePanel === "design_studio" ? (
            <DesignStudioPage />
          ) : GAME_SCENE_PANELS.has(activePanel) ? (
            <GameScene />
          ) : (
            <InspectorStagePlaceholder />
          )}
        </ShellLayout>
        <BuildingModal />
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