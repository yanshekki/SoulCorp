import { useEffect } from "react";
import {
  initWorkspaceSnapshot,
  pickDefaultPageIdFromFolder,
} from "../services/workspaceClient";
import { useGameStore } from "../stores/gameStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { clearLocalProgress, reportLocalProgress } from "../stores/progressStore";

export function useWorkspaceBootstrap(enabled: boolean) {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const applySnapshot = useWorkspaceStore((state) => state.applySnapshot);
  const setIsLoading = useWorkspaceStore((state) => state.setIsLoading);

  useEffect(() => {
    if (!enabled || !activeCompanyId) {
      return;
    }

    const load = async () => {
      setIsLoading(true);
      reportLocalProgress("workspace_init", "Initializing workspace…", 20, "init");
      try {
        const snapshot = await initWorkspaceSnapshot();
        const { selectedPageId, openPage, loadFolderChildren } = useWorkspaceStore.getState();
        applySnapshot(snapshot);
        await useWorkspaceStore.getState().loadViewData(useWorkspaceStore.getState().activeView);
        if (!selectedPageId) {
          const companyFolder =
            snapshot.folders.find((folder) => folder.id === "folder-company") ??
            snapshot.folders.find((folder) => folder.workspace_type === "company");
          if (companyFolder) {
            await loadFolderChildren(companyFolder.id);
            const defaultPageId = await pickDefaultPageIdFromFolder(companyFolder.id);
            if (defaultPageId) {
              await openPage(defaultPageId);
            }
          }
        }
      } catch (error) {
        useWorkspaceStore.setState({ pageOpenError: String(error) });
      } finally {
        clearLocalProgress("workspace_init");
        setIsLoading(false);
      }
    };

    void load();
  }, [activeCompanyId, enabled, applySnapshot, setIsLoading]);
}