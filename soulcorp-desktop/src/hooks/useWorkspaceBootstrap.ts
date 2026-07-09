import { useEffect } from "react";
import {
  initWorkspaceSnapshot,
  listWorkspaceSnapshot,
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
      const state = useWorkspaceStore.getState();
      if (state.workspacePreloaded && state.tree.folders.length > 0 && state.summariesLoaded) {
        setIsLoading(false);
        if (!state.selectedPageId) {
          const companyFolder =
            state.tree.folders.find((folder) => folder.id === "folder-company") ??
            state.tree.folders.find((folder) => folder.workspace_type === "company");
          if (companyFolder) {
            const { loadFolderChildren, openPage } = useWorkspaceStore.getState();
            await loadFolderChildren(companyFolder.id);
            const defaultPageId = await pickDefaultPageIdFromFolder(companyFolder.id);
            if (defaultPageId) {
              await openPage(defaultPageId);
            }
          }
        }
        void listWorkspaceSnapshot().then((snapshot) => {
          useWorkspaceStore.getState().applySnapshot(snapshot);
        });
        return;
      }

      setIsLoading(true);
      reportLocalProgress("workspace_init", "Initializing workspace…", 20, "init");
      try {
        const snapshot = await initWorkspaceSnapshot();
        const { selectedPageId, openPage, loadFolderChildren } = useWorkspaceStore.getState();
        applySnapshot(snapshot);
        await useWorkspaceStore.getState().loadViewData(useWorkspaceStore.getState().activeView);
        useWorkspaceStore.setState({ workspacePreloaded: true });
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