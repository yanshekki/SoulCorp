import { FolderTree } from "./FolderTree";
import { PageEditor } from "./PageEditor";
import { WorkspaceDatabase } from "./WorkspaceDatabase";
import { WorkspaceSearch } from "./WorkspaceSearch";
import { useWorkspaceBootstrap } from "../../hooks/useWorkspaceBootstrap";
import { useWorkspaceSidebarResize } from "../../hooks/useWorkspaceSidebarResize";
import { useWorkspaceStore } from "../../stores/workspaceStore";

export function WorkspaceShell() {
  useWorkspaceBootstrap(true);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const openPage = useWorkspaceStore((state) => state.openPage);
  const { sidebarWidth, startResize } = useWorkspaceSidebarResize();

  return (
    <section
      className="workspace-shell"
      style={{ ["--workspace-sidebar-width" as string]: `${sidebarWidth}px` }}
    >
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          <h2>Workspace</h2>
          <p>Company hub, department teams, and employee journals</p>
        </div>
        <WorkspaceSearch onOpenResult={(pageId) => void openPage(pageId)} />
        <WorkspaceDatabase />
        {isLoading ? (
          <p className="muted">Loading workspace...</p>
        ) : (
          <FolderTree />
        )}
      </aside>
      <div
        className="workspace-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace sidebar"
        onMouseDown={(event) => startResize(event)}
      />
      <PageEditor />
    </section>
  );
}