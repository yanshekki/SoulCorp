import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";
import { reloadGameState } from "./useReloadGameState";

export function useGameBootstrap() {
  const setOnboardingReady = useGameStore((state) => state.setOnboardingReady);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await reloadGameState();
      } catch (error) {
        setStatusMessage(`Bootstrap fallback: ${String(error)}`);
      } finally {
        setOnboardingReady(true);
      }
    };

    void bootstrap();
  }, [setOnboardingReady, setStatusMessage]);
}