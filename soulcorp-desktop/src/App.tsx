import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameScene } from "./components/GameScene";
import { ShellLayout } from "./components/UI/ShellLayout";
import { useGameStore } from "./stores/gameStore";
import "./App.css";

function App() {
  const statusMessage = useGameStore((state) => state.statusMessage);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    invoke<string>("get_app_status")
      .then((message) => setStatusMessage(message))
      .catch((error) => setStatusMessage(String(error)));
  }, [setStatusMessage]);

  return (
    <ShellLayout statusMessage={statusMessage}>
      <GameScene />
    </ShellLayout>
  );
}

export default App;