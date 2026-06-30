import { invoke } from "@tauri-apps/api/core";
import { FolderTree } from "./FolderTree";
import { PageEditor } from "./PageEditor";
import { WorkspaceDatabase } from "./WorkspaceDatabase";
import { WorkspaceSearch } from "./WorkspaceSearch";
import { useWorkspaceBootstrap } from "../../hooks/useWorkspaceBootstrap";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspacePage } from "../../types/workspace";

export function WorkspaceShell() {
  useWorkspaceBootstrap(true);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const setSelectedPage = useWorkspaceStore((state) => state.setSelectedPage);

  const openPage = async (pageId: string) => {
    const page = await invoke<WorkspacePage>("get_workspace_page", { page_id: pageId });
    setSelectedPage(page);
  };

  return (
    <section className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          <h2>Workspace</h2>
          <p>Company docs, agent folders, and meeting notes</p>
        </div>
        <WorkspaceSearch onOpenResult={(pageId) => void openPage(pageId)} />
        <WorkspaceDatabase />
        {isLoading ? (
          <p className="muted">Loading workspace...</p>
        ) : (
          <FolderTree onSelectPage={(pageId) => void openPage(pageId)} />
        )}
      </aside>
      <PageEditor onOpenPage={(pageId) => void openPage(pageId)} />
    </section>
  );
}