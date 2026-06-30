import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BuildingModal } from "./components/BuildingModal";
import { GameScene } from "./components/GameScene";
import { OnboardingWizard } from "./components/UI/OnboardingWizard";
import { ShellLayout } from "./components/UI/ShellLayout";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell";
import { useGameBootstrap } from "./hooks/useGameBootstrap";
import { useSimulationLoop } from "./hooks/useSimulationLoop";
import { useGameStore } from "./stores/gameStore";
import "./App.css";

function App() {
  const statusMessage = useGameStore((state) => state.statusMessage);
  const activePanel = useGameStore((state) => state.activePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useGameBootstrap();
  useSimulationLoop();

  useEffect(() => {
    invoke<string>("get_app_status")
      .then((message) => setStatusMessage(message))
      .catch((error) => setStatusMessage(String(error)));
  }, [setStatusMessage]);

  return (
    <>
      <ShellLayout statusMessage={statusMessage}>
        {activePanel === "workspace" ? <WorkspaceShell /> : <GameScene />}
      </ShellLayout>
      <BuildingModal />
      <OnboardingWizard />
    </>
  );
}

export default App;