import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  type OperationProgress,
  useProgressStore,
} from "../stores/progressStore";

export function useOperationProgress(): void {
  const setProgress = useProgressStore((state) => state.setProgress);
  const clearProgress = useProgressStore((state) => state.clearProgress);
  const setSimTickProgress = useProgressStore((state) => state.setSimTickProgress);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<OperationProgress>("operation-progress", (event) => {
      const payload = event.payload;
      if (payload.phase === "clear") {
        clearProgress(payload.operation_id);
        if (payload.operation_id === "sim_tick") {
          setSimTickProgress(null, null);
        }
        return;
      }

      if (payload.operation_id === "sim_tick") {
        setSimTickProgress(payload.label, payload.percent >= 0 ? payload.percent : null);
        if (payload.percent >= 100 || payload.phase === "done") {
          window.setTimeout(() => setSimTickProgress(null, null), 400);
        }
        return;
      }

      if (payload.percent >= 100 || payload.phase === "done") {
        setProgress(payload);
        window.setTimeout(() => clearProgress(payload.operation_id), 350);
        return;
      }

      setProgress(payload);
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, [clearProgress, setProgress, setSimTickProgress]);
}