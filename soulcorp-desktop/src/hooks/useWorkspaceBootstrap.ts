import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { WorkspaceTree } from "../types/workspace";

export function useWorkspaceBootstrap(enabled: boolean) {
  const setTree = useWorkspaceStore((state) => state.setTree);
  const setIsLoading = useWorkspaceStore((state) => state.setIsLoading);

  useEffect(() => {
    if (!enabled) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const tree = await invoke<WorkspaceTree>("init_workspace");
        setTree(tree);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [enabled, setIsLoading, setTree]);
}