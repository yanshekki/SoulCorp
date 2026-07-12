import { useEffect, useRef, useState } from "react";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { clearAllTestData } from "../../services/testModeClient";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { confirmDialog } from "../../utils/nativeDialog";
import { useI18n } from "../../i18n/I18nProvider";

export function TestModeButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setOnboardingReady = useGameStore((state) => state.setOnboardingReady);

  if (!import.meta.env.DEV) {
    return null;
  }

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
    const confirmed = await confirmDialog(t("testMode.clearConfirm"));
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
      setStatusMessage(`${result.message}${t("testMode.clearedSuffix")}`);
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
        {busy ? t("testMode.working") : t("testMode.label")}
        <span className="test-mode-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div id="test-mode-actions" className="test-mode-actions" role="group" aria-label={t("testMode.actionsAria")}>
          <button
            type="button"
            className="test-mode-action test-mode-action--danger"
            disabled={busy}
            onClick={() => void handleClear()}
          >
            {t("testMode.clearAll")}
          </button>
        </div>
      ) : null}
    </div>
  );
}