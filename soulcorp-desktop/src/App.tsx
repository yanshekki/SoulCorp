import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BuildingModal } from "./components/BuildingModal";
import { GameScene } from "./components/GameScene";
import { ShellLayout } from "./components/UI/ShellLayout";
import { useSimulationLoop } from "./hooks/useSimulationLoop";
import { useGameStore } from "./stores/gameStore";
import "./App.css";

function App() {
  const statusMessage = useGameStore((state) => state.statusMessage);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useSimulationLoop();

  useEffect(() => {
    invoke<string>("get_app_status")
      .then((message) => setStatusMessage(message))
      .catch((error) => setStatusMessage(String(error)));
  }, [setStatusMessage]);

  return (
    <>
      <ShellLayout statusMessage={statusMessage}>
        <GameScene />
      </ShellLayout>
      <BuildingModal />
    </>
  );
}

export default App;