import { useEffect, useRef, useState } from "react";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { clearAllTestData, seedFakeTestData } from "../../services/testModeClient";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface TestModeButtonProps {
  /** Inline in app statusbar (default) — avoids overlapping build Save + footer. */
  placement?: "statusbar" | "floating";
}

export function TestModeButton({ placement = "statusbar" }: TestModeButtonProps) {
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
      "清空所有本機公司、存檔、workspace 同設計資料？此操作無法復原。",
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
      setStatusMessage(result.message);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSeed = async () => {
    setBusy(true);
    setOpen(false);
    try {
      const result = await seedFakeTestData();
      resetLocalStores();
      setOnboardingReady(true);
      await reloadGameState();
      useGameStore.setState({
        isPaused: false,
        activePanel: "office",
      });
      setStatusMessage(result.message);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`test-mode-root${placement === "statusbar" ? " test-mode-root--statusbar" : " test-mode-root--floating"}`}
      ref={rootRef}
    >
      {open ? (
        <div className="test-mode-menu" role="menu">
          <button type="button" disabled={busy} onClick={() => void handleClear()}>
            清空數據
          </button>
          <button type="button" disabled={busy} onClick={() => void handleSeed()}>
            快速創立假數據
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="test-mode-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? "處理中…" : "測試模式"}
      </button>
    </div>
  );
}