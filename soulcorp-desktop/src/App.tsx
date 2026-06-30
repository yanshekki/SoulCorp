import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BuildingModal } from "./components/BuildingModal";
import { GameScene } from "./components/GameScene";
import { CreateCompanyModal } from "./components/UI/CreateCompanyModal";
import { OnboardingWizard } from "./components/UI/OnboardingWizard";
import { ShellLayout } from "./components/UI/ShellLayout";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell";
import { useGameBootstrap } from "./hooks/useGameBootstrap";
import { useSimulationLoop } from "./hooks/useSimulationLoop";
import { useGameStore } from "./stores/gameStore";
import "./App.css";
import "./styles/design-system.css";

function App() {
  const statusMessage = useGameStore((state) => state.statusMessage);
  const activePanel = useGameStore((state) => state.activePanel);
  const onboardingCompleted = useGameStore((state) => state.onboardingCompleted);
  const onboardingReady = useGameStore((state) => state.onboardingReady);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useGameBootstrap();
  useSimulationLoop();

  useEffect(() => {
    invoke<string>("get_app_status")
      .then((message) => setStatusMessage(message))
      .catch((error) => setStatusMessage(String(error)));
  }, [setStatusMessage]);

  if (!onboardingReady) {
    return (
      <div className="app-loading-screen">
        <p>Loading SoulCorp...</p>
      </div>
    );
  }

  if (!onboardingCompleted) {
    return <OnboardingWizard />;
  }

  return (
    <>
      <ShellLayout statusMessage={statusMessage}>
        {activePanel === "workspace" ? <WorkspaceShell /> : <GameScene />}
      </ShellLayout>
      <BuildingModal />
      <CreateCompanyModal />
    </>
  );
}

export default App;