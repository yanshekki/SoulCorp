import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  type OperationProgress,
  isOrgAiOperation,
  useProgressStore,
} from "../stores/progressStore";

export function useOperationProgress(): void {
  const setProgress = useProgressStore((state) => state.setProgress);
  const clearProgress = useProgressStore((state) => state.clearProgress);
  const finishProgress = useProgressStore((state) => state.finishProgress);
  const setSimTickProgress = useProgressStore((state) => state.setSimTickProgress);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<OperationProgress>("operation-progress", (event) => {
      const payload = event.payload;
      if (payload.phase === "clear") {
        // Org AI: keep in "recent" strip instead of hard-delete.
        if (isOrgAiOperation(payload.operation_id)) {
          finishProgress(payload.operation_id, payload.label || undefined, "done");
        } else {
          clearProgress(payload.operation_id);
        }
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

      // Meeting close: clear immediately so the dock cannot stick after navigation.
      if (
        payload.phase === "meeting_close"
        || (payload.operation_id.startsWith("meeting_")
          && (payload.label ?? "").toLowerCase().includes("closing"))
      ) {
        setProgress(payload);
        window.setTimeout(() => clearProgress(payload.operation_id), 2500);
        return;
      }

      if (payload.percent >= 100 || payload.phase === "done") {
        setProgress(payload);
        const delay = isOrgAiOperation(payload.operation_id) ? 4000 : 350;
        window.setTimeout(() => {
          finishProgress(payload.operation_id, payload.label, "done");
        }, delay);
        return;
      }

      setProgress(payload);
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, [clearProgress, finishProgress, setProgress, setSimTickProgress]);
}