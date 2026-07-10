import { useEffect, useRef, useState } from "react";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { clearAllTestData } from "../../services/testModeClient";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

export function TestModeButton() {
  if (!import.meta.env.DEV) {
    return null;
  }

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setOnboardingReady = useGameStore((state) => state.setOnboardingReady);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const resetLocalStores = () => {
    useWorkspaceStore.getState().reset();
    useDesignStudioStore.getState().resetDraft();
  };

  const handleClear = async () => {
    const confirmed = window.confirm(
      "Clear all local companies, saves, workspace, and design data? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setOpen(false);
    try {
      const result = await clearAllTestData();
      resetLocalStores();
      setOnboardingReady(true);
      await reloadGameState();
      useGameStore.getState().setActivePanel("projects");
      useGameStore.getState().bumpScrumRevision();
      setStatusMessage(
        `${result.message} Create a company to begin with real operational data.`,
      );
      // Projects opens on Command Center section by default (first pipeline step).
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="test-mode-toolbar" ref={rootRef} data-open={open || undefined}>
      <button
        type="button"
        className="test-mode-trigger"
        aria-expanded={open}
        aria-controls="test-mode-actions"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? "Working…" : "Test mode"}
        <span className="test-mode-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div id="test-mode-actions" className="test-mode-actions" role="group" aria-label="Test mode actions">
          <button
            type="button"
            className="test-mode-action test-mode-action--danger"
            disabled={busy}
            onClick={() => void handleClear()}
          >
            Clear all data
          </button>
        </div>
      ) : null}
    </div>
  );
}