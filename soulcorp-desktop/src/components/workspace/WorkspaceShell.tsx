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
      className="workspace-shell app-page"
      style={{ ["--workspace-sidebar-width" as string]: `${sidebarWidth}px` }}
    >
      <header className="app-page-header workspace-page-header">
        <div className="app-page-header-main">
          <h2>Workspace</h2>
          <p className="muted">Deliverables & docs</p>
        </div>
      </header>

      <div className="workspace-shell-body app-page-body">
        <aside className="workspace-sidebar app-page-nav">
          <WorkspaceSearch onOpenResult={(pageId) => void openPage(pageId)} />
          <WorkspaceDatabase />
          {isLoading ? <p className="muted">Loading…</p> : <FolderTree />}
        </aside>
        <div
          className="workspace-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workspace sidebar"
          onMouseDown={(event) => startResize(event)}
        />
        <PageEditor />
      </div>
    </section>
  );
}