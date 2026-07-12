import { openLogged as open } from "../../utils/pluginLog";
import { useCallback, useEffect, useState } from "react";
import { createWorkspacePage, importWorkspaceFiles } from "../../services/workspaceClient";
import { useWorkspaceBootstrap } from "../../hooks/useWorkspaceBootstrap";
import { useWorkspaceSidebarResize } from "../../hooks/useWorkspaceSidebarResize";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { WorkflowNextButton } from "../UI/WorkflowNextButton";
import { alertDialog } from "../../utils/nativeDialog";
import { WorkspaceCommandPalette } from "./WorkspaceCommandPalette";
import { WorkspaceDatabase } from "./WorkspaceDatabase";
import { WorkspaceMainPanel } from "./WorkspaceMainPanel";
import { WorkspaceNavigator } from "./WorkspaceNavigator";
import { WorkspaceSearch } from "./WorkspaceSearch";

function resolveDefaultFolderId(
  folders: ReturnType<typeof useWorkspaceStore.getState>["tree"]["folders"],
): string | null {
  const companyFolder = folders.find((folder) => folder.id === "folder-company");
  return (
    companyFolder?.id ??
    folders.find((folder) => folder.workspace_type === "company")?.id ??
    null
  );
}

export function WorkspaceShell() {
  const { t } = useI18n();
  useWorkspaceBootstrap(true);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const tree = useWorkspaceStore((state) => state.tree);
  const openWorkspaceItem = useWorkspaceStore((state) => state.openWorkspaceItem);
  const loadFolderChildren = useWorkspaceStore((state) => state.loadFolderChildren);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const upsertFileSummary = useWorkspaceStore((state) => state.upsertFileSummary);
  const syncPreferences = useWorkspaceStore((state) => state.syncPreferences);
  const setCommandPaletteOpen = useWorkspaceStore((state) => state.setCommandPaletteOpen);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const { sidebarWidth, startResize } = useWorkspaceSidebarResize();
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    syncPreferences(activeCompanyId);
  }, [activeCompanyId, syncPreferences]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCommandPaletteOpen]);

  const quickCreatePage = useCallback(async () => {
    const targetFolderId = resolveDefaultFolderId(tree.folders);
    if (!targetFolderId) {
      await alertDialog(t("workspace.noCompanyFolder"));
      return;
    }
    setCreating(true);
    try {
      const page = await createWorkspacePage(targetFolderId, t("workspace.untitledPage"));
      await loadFolderChildren(targetFolderId, true);
      upsertPageSummary({
        id: page.id,
        title: page.title,
        folder_id: page.folder_id,
        last_edited_at: page.last_edited_at,
        last_edited_by: page.last_edited_by,
        sort_order: page.sort_order,
      });
      await openWorkspaceItem(page.id);
    } finally {
      setCreating(false);
    }
  }, [tree.folders, loadFolderChildren, upsertPageSummary, openWorkspaceItem]);

  const quickUpload = useCallback(async () => {
    const targetFolderId = resolveDefaultFolderId(tree.folders);
    if (!targetFolderId) {
      await alertDialog(t("workspace.noCompanyFolder"));
      return;
    }
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        { name: t("workspace.fileFilter.images"), extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "heif"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: t("workspace.fileFilter.documents"), extensions: ["doc", "docx", "rtf", "odt", "txt", "md", "markdown"] },
        { name: t("workspace.fileFilter.spreadsheets"), extensions: ["xls", "xlsx", "csv", "ods"] },
        { name: t("workspace.fileFilter.presentations"), extensions: ["ppt", "pptx", "odp"] },
        { name: t("workspace.fileFilter.archives"), extensions: ["zip", "rar", "7z", "tar", "gz", "tgz"] },
        { name: t("workspace.fileFilter.video"), extensions: ["mp4", "m4v", "webm", "mov"] },
        { name: t("workspace.fileFilter.audio"), extensions: ["mp3", "wav", "ogg", "m4a"] },
        { name: t("workspace.fileFilter.data"), extensions: ["json", "yaml", "yml", "xml"] },
      ],
    });
    if (!selected) {
      return;
    }
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) {
      return;
    }
    setUploading(true);
    try {
      const imported = await importWorkspaceFiles(targetFolderId, paths);
      await loadFolderChildren(targetFolderId, true);
      for (const file of imported) {
        upsertFileSummary(file);
      }
      if (imported[0]) {
        await openWorkspaceItem(imported[0].id);
      }
    } catch (error) {
      await alertDialog(String(error));
    } finally {
      setUploading(false);
    }
  }, [tree.folders, loadFolderChildren, upsertFileSummary, openWorkspaceItem]);

  return (
    <section
      className="workspace-shell app-page ws-shell"
      style={{ ["--workspace-sidebar-width" as string]: `${sidebarWidth}px` }}
    >
      <header className="app-page-header workspace-page-header ws-shell-header">
        <div className="app-page-header-main">
          <p className="workflow-step-badge">{formatWorkflowStepBadge("workspace")}</p>
          <h2>{t("workspace.pageTitle")}</h2>
          <p className="muted">{t("workspace.pageSubtitle")}</p>
        </div>
        <div className="ws-shell-header-search">
          <WorkspaceSearch onOpenResult={(itemId) => void openWorkspaceItem(itemId)} />
        </div>
        <div className="ws-shell-header-actions">
          <WorkflowNextButton panel="workspace" />
          <button
            type="button"
            className="ws-shell-action-btn ws-shell-action-btn--ghost"
            title={t("workspace.cmdPalette")}
            onClick={() => setCommandPaletteOpen(true)}
          >
            ⌘K
          </button>
          <button
            type="button"
            className="ws-shell-action-btn"
            disabled={uploading || isLoading}
            onClick={() => void quickUpload()}
          >
            {uploading ? t("workspace.uploading") : t("workspace.upload")}
          </button>
          <button
            type="button"
            className="ws-shell-action-btn"
            disabled={creating || isLoading}
            onClick={() => void quickCreatePage()}
          >
            {creating ? t("workspace.creating") : t("workspace.newPage")}
          </button>
        </div>
      </header>

      <div className="workspace-shell-body app-page-body ws-shell-body">
        <aside className="workspace-sidebar app-page-nav ws-nav">
          <WorkspaceDatabase />
          {isLoading ? (
            <p className="ws-nav-loading muted">{t("workspace.shellLoading")}</p>
          ) : (
            <WorkspaceNavigator />
          )}
        </aside>
        <div
          className="workspace-resizer ws-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("workspace.resizeSidebar")}
          onMouseDown={(event) => startResize(event)}
        />
        <WorkspaceMainPanel />
      </div>

      <WorkspaceCommandPalette
        onNewPage={() => void quickCreatePage()}
        onUpload={() => void quickUpload()}
      />
    </section>
  );
}