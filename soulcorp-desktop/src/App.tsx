import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BuildingModal } from "./components/BuildingModal";
import { CompanySetupGate } from "./components/UI/CompanySetupGate";
import { CreateCompanyModal } from "./components/UI/CreateCompanyModal";
import { OnboardingWizard } from "./components/UI/OnboardingWizard";
import { ShellLayout } from "./components/UI/ShellLayout";
import { PanelHost } from "./components/UI/PanelHost";
import { LoadingOverlay } from "./components/UI/LoadingOverlay";
import { showBuildingModal } from "./config/features";
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
    const webglPanels = new Set<SidebarPanel>(["office", "design_studio"]);
    if (webglPanels.has(previous) && !webglPanels.has(activePanel)) {
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
          <PanelHost activePanel={activePanel} stageReady={stageReady} />
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