import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";
import { reloadGameState } from "./useReloadGameState";
import { languageFromSettings, translate } from "../i18n";

export function useGameBootstrap() {
  const setOnboardingReady = useGameStore((state) => state.setOnboardingReady);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await reloadGameState();
      } catch (error) {
        setStatusMessage(translate(languageFromSettings(useGameStore.getState().settings), "status.bootstrapFallback", { error: String(error) }));
      } finally {
        setOnboardingReady(true);
      }
    };

    void bootstrap();
  }, [setOnboardingReady, setStatusMessage]);
}