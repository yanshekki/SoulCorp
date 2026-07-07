import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import {
  createWorkspaceFolder,
  createWorkspacePage,
  deleteWorkspaceFile,
  deleteWorkspaceFolder,
  deleteWorkspacePage,
  importWorkspaceFiles,
  listWorkspaceSnapshot,
  reorderWorkspaceItems,
} from "../../services/workspaceClient";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type {
  WorkspaceFileKind,
  WorkspaceFolder,
  WorkspacePage,
  WorkspaceTemplate,
} from "../../types/workspace";
import { fileKindIcon } from "../../utils/workspaceFileTypes";

interface WorkspaceSection {
  id: string;
  label: string;
  rootIds: string[];
}

const SECTIONS: WorkspaceSection[] = [
  { id: "company", label: "Company", rootIds: ["folder-company"] },
  { id: "teams", label: "Teams", rootIds: ["folder-teams"] },
];

function collapsedFoldersKey(companyId: string | null): string {
  return `soulcorp-workspace-collapsed-${companyId ?? "none"}`;
}

function loadCollapsedFolders(companyId: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(collapsedFoldersKey(companyId));
    if (!raw) {
      return new Set();
    }
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveCollapsedFolders(companyId: string | null, collapsed: Set<string>) {
  localStorage.setItem(collapsedFoldersKey(companyId), JSON.stringify([...collapsed]));
}

function canDeleteFolder(folder: WorkspaceFolder): boolean {
  return folder.workspace_type === "custom";
}

function canCreateSubfolder(folder: WorkspaceFolder): boolean {
  return (
    folder.workspace_type === "company" ||
    folder.workspace_type === "department" ||
    folder.workspace_type === "custom"
  );
}

type FolderItem =
  | { kind: "page"; id: string; label: string; sort_order: number }
  | { kind: "file"; id: string; label: string; sort_order: number; file_kind: WorkspaceFileKind };

function sortFolderItems(items: FolderItem[]): FolderItem[] {
  return [...items].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.label.localeCompare(right.label);
  });
}

interface FolderTreeProps {
  organizeMode?: boolean;
}

export function FolderTree({ organizeMode = false }: FolderTreeProps) {
  const tree = useWorkspaceStore((state) => state.tree);
  const selectedPageId = useWorkspaceStore((state) => state.selectedPageId);
  const selectedFileId = useWorkspaceStore((state) => state.selectedFileId);
  const openingPageId = useWorkspaceStore((state) => state.openingPageId);
  const openingFileId = useWorkspaceStore((state) => state.openingFileId);
  const folderChildren = useWorkspaceStore((state) => state.folderChildren);
  const folderChildrenLoading = useWorkspaceStore((state) => state.folderChildrenLoading);
  const loadFolderChildren = useWorkspaceStore((state) => state.loadFolderChildren);
  const setWorkspaceFolders = useWorkspaceStore((state) => state.setWorkspaceFolders);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const upsertFileSummary = useWorkspaceStore((state) => state.upsertFileSummary);
  const removePageSummary = useWorkspaceStore((state) => state.removePageSummary);
  const removeFileSummary = useWorkspaceStore((state) => state.removeFileSummary);
  const removeFolder = useWorkspaceStore((state) => state.removeFolder);
  const openWorkspaceItem = useWorkspaceStore((state) => state.openWorkspaceItem);
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [templateFolderId, setTemplateFolderId] = useState<string | null>(null);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() =>
    loadCollapsedFolders(activeCompanyId),
  );

  useEffect(() => {
    setCollapsedFolders(loadCollapsedFolders(activeCompanyId));
  }, [activeCompanyId]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void invoke<WorkspaceTemplate[]>("list_workspace_templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const itemsByFolder = useMemo(() => {
    const map = new Map<string, FolderItem[]>();
    for (const [folderId, children] of Object.entries(folderChildren)) {
      const items: FolderItem[] = [
        ...children.pages.map((page) => ({
          kind: "page" as const,
          id: page.id,
          label: page.title,
          sort_order: page.sort_order ?? 0,
        })),
        ...children.files.map((file) => ({
          kind: "file" as const,
          id: file.id,
          label: file.name,
          sort_order: file.sort_order ?? 0,
          file_kind: file.file_kind,
        })),
      ];
      map.set(folderId, sortFolderItems(items));
    }
    return map;
  }, [folderChildren]);

  const childrenFor = (folderId: string) =>
    tree.folders
      .filter((folder) => folder.parent_id === folderId)
      .sort((left, right) => {
        const order = (folder: WorkspaceFolder) => {
          if (folder.workspace_type === "department") return 0;
          if (folder.workspace_type === "custom") return 1;
          if (folder.workspace_type === "agent") return 2;
          return 3;
        };
        const byType = order(left) - order(right);
        if (byType !== 0) {
          return byType;
        }
        const leftOrder = left.sort_order ?? 0;
        const rightOrder = right.sort_order ?? 0;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return left.name.localeCompare(right.name);
      });

  const refreshFolders = async () => {
    const snapshot = await listWorkspaceSnapshot();
    setWorkspaceFolders(snapshot.folders);
  };

  const refreshFolder = async (folderId: string) => {
    await loadFolderChildren(folderId, true);
  };

  const toggleFolder = (folderId: string) => {
    const willExpand = collapsedFolders.has(folderId);
    if (willExpand) {
      void loadFolderChildren(folderId);
    }
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      saveCollapsedFolders(activeCompanyId, next);
      return next;
    });
  };

  const selectCreatedPage = async (page: WorkspacePage) => {
    upsertPageSummary({
      id: page.id,
      title: page.title,
      folder_id: page.folder_id,
      last_edited_at: page.last_edited_at,
      last_edited_by: page.last_edited_by,
      sort_order: page.sort_order,
    });
    await openWorkspaceItem(page.id);
  };

  const createFromTemplate = async (folderId: string, templateId: string) => {
    setBusy(true);
    try {
      const page = await invoke<WorkspacePage>("create_page_from_template_cmd", {
        request: {
          folder_id: folderId,
          template_id: templateId,
          title: null,
        },
      });
      await refreshFolder(folderId);
      await selectCreatedPage(page);
      setTemplateFolderId(null);
    } finally {
      setBusy(false);
    }
  };

  const createPage = async (folderId: string) => {
    setBusy(true);
    try {
      const page = await createWorkspacePage(folderId, "Untitled Page");
      await refreshFolder(folderId);
      await selectCreatedPage(page);
    } finally {
      setBusy(false);
    }
  };

  const createSubfolder = async (folder: WorkspaceFolder) => {
    const name = window.prompt("Team folder name");
    if (!name?.trim()) {
      return;
    }
    setBusy(true);
    try {
      await createWorkspaceFolder(folder.id, name.trim());
      await refreshFolders();
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (folderId: string) => {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "heif"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "Documents", extensions: ["doc", "docx", "rtf", "odt", "txt", "md", "markdown"] },
        { name: "Spreadsheets", extensions: ["xls", "xlsx", "csv", "ods"] },
        { name: "Presentations", extensions: ["ppt", "pptx", "odp"] },
        { name: "Archives", extensions: ["zip", "rar", "7z", "tar", "gz", "tgz"] },
        { name: "Video", extensions: ["mp4", "m4v", "webm", "mov"] },
        { name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] },
        { name: "Data", extensions: ["json", "yaml", "yml", "xml"] },
      ],
    });
    if (!selected) {
      return;
    }
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const imported = await importWorkspaceFiles(folderId, paths);
      await refreshFolder(folderId);
      for (const file of imported) {
        upsertFileSummary(file);
      }
      if (imported[0]) {
        await openWorkspaceItem(imported[0].id);
      }
    } catch (error) {
      window.alert(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFile = async (folderId: string, fileId: string, name: string) => {
    const confirmed = window.confirm(`Delete file "${name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteWorkspaceFile(fileId);
      removeFileSummary(fileId);
      await refreshFolder(folderId);
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePage = async (folderId: string, pageId: string, title: string) => {
    const confirmed = window.confirm(`Delete page "${title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteWorkspacePage(pageId);
      removePageSummary(pageId);
      await refreshFolder(folderId);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFolder = async (folder: WorkspaceFolder) => {
    const confirmed = window.confirm(`Delete folder "${folder.name}"?`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteWorkspaceFolder(folder.id);
      removeFolder(folder.id);
      await refreshFolders();
    } catch (error) {
      window.alert(String(error));
    } finally {
      setBusy(false);
    }
  };

  const moveItem = async (folderId: string, itemId: string, direction: "up" | "down") => {
    const items = itemsByFolder.get(folderId) ?? [];
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const nextOrder = [...items];
    const [current] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, current);

    setBusy(true);
    try {
      await reorderWorkspaceItems(folderId, nextOrder.map((item) => item.id));
      await refreshFolder(folderId);
    } finally {
      setBusy(false);
    }
  };

  const renderFolder = (folder: WorkspaceFolder, depth = 0) => {
    const items = itemsByFolder.get(folder.id) ?? [];
    const children = childrenFor(folder.id);
    const isAgentFolder = folder.workspace_type === "agent";
    const isCollapsed = collapsedFolders.has(folder.id);
    const isLoaded = Boolean(folderChildren[folder.id]);
    const isLoadingChildren = Boolean(folderChildrenLoading[folder.id]);
    const hasContents =
      children.length > 0 ||
      items.length > 0 ||
      templateFolderId === folder.id ||
      !isLoaded ||
      isLoadingChildren;

    return (
      <div key={folder.id} className="folder-group" style={{ paddingLeft: depth * 12 }}>
        <div className="folder-row">
          <button
            type="button"
            className="folder-row-toggle"
            aria-expanded={!isCollapsed}
            onClick={() => toggleFolder(folder.id)}
          >
            <span className="folder-chevron" aria-hidden="true">
              {hasContents ? (isCollapsed ? "▸" : "▾") : "·"}
            </span>
            <span className="folder-row-icon">{folder.icon ?? "📂"}</span>
            <span className="folder-row-name">{folder.name}</span>
            {isAgentFolder ? <span className="folder-row-badge">Employee</span> : null}
          </button>
          {organizeMode ? (
          <div className="folder-row-actions">
            {canCreateSubfolder(folder) ? (
              <button
                type="button"
                className="tiny-btn"
                title="New subfolder"
                disabled={busy}
                onClick={() => void createSubfolder(folder)}
              >
                📁
              </button>
            ) : null}
            <button
              type="button"
              className="tiny-btn"
              title="New page"
              disabled={busy}
              onClick={() => void createPage(folder.id)}
            >
              +
            </button>
            <button
              type="button"
              className="tiny-btn"
              title="Upload files"
              disabled={busy}
              onClick={() => void uploadFiles(folder.id)}
            >
              ⬆
            </button>
            <button
              type="button"
              className="tiny-btn"
              title="From template"
              disabled={busy}
              onClick={() =>
                setTemplateFolderId((current) => (current === folder.id ? null : folder.id))
              }
            >
              T
            </button>
            {canDeleteFolder(folder) ? (
              <button
                type="button"
                className="tiny-btn danger"
                title="Delete folder"
                disabled={busy}
                onClick={() => void handleDeleteFolder(folder)}
              >
                ×
              </button>
            ) : null}
          </div>
          ) : null}
        </div>

        {!isCollapsed ? (
          <>
            {isLoadingChildren ? (
              <p className="ws-folder-loading muted">Loading…</p>
            ) : null}
            {templateFolderId === folder.id ? (
              <div className="template-picker">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="template-chip"
                    disabled={busy}
                    onClick={() => void createFromTemplate(folder.id, template.id)}
                  >
                    {template.icon ?? "📄"} {template.name}
                  </button>
                ))}
              </div>
            ) : null}

            {items.map((item, index) => {
              const isActive =
                item.kind === "page"
                  ? selectedPageId === item.id
                  : selectedFileId === item.id;
              const isOpening =
                item.kind === "page"
                  ? openingPageId === item.id
                  : openingFileId === item.id;
              return (
                <div
                  key={item.id}
                  className={`page-row-wrap${item.kind === "file" ? " file-row-wrap" : ""}${
                    isActive ? " active" : ""
                  }${isOpening ? " opening" : ""}`}
                >
                  {organizeMode ? (
                  <div className="page-row-order">
                    <button
                      type="button"
                      className="tiny-btn"
                      title="Move up"
                      disabled={busy || index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        void moveItem(folder.id, item.id, "up");
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="tiny-btn"
                      title="Move down"
                      disabled={busy || index === items.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        void moveItem(folder.id, item.id, "down");
                      }}
                    >
                      ↓
                    </button>
                  </div>
                  ) : null}
                  <button
                    type="button"
                    className={`page-row ${isActive ? "active" : ""}`}
                    onClick={() => void openWorkspaceItem(item.id)}
                  >
                    {item.kind === "file" ? (
                      <span className="folder-item-label">
                        <span className="folder-item-icon" aria-hidden="true">
                          {fileKindIcon(item.file_kind)}
                        </span>
                        <span className="folder-item-name">{item.label}</span>
                      </span>
                    ) : (
                      <span className="folder-item-label">
                        <span className="folder-item-icon" aria-hidden="true">
                          📄
                        </span>
                        <span className="folder-item-name">{item.label}</span>
                      </span>
                    )}
                  </button>
                  {organizeMode ? (
                  <button
                    type="button"
                    className="tiny-btn danger page-delete-btn"
                    title={item.kind === "file" ? "Delete file" : "Delete page"}
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (item.kind === "file") {
                        void handleDeleteFile(folder.id, item.id, item.label);
                      } else {
                        void handleDeletePage(folder.id, item.id, item.label);
                      }
                    }}
                  >
                    ×
                  </button>
                  ) : null}
                </div>
              );
            })}

            {children.map((child) => renderFolder(child, depth + 1))}
          </>
        ) : null}
      </div>
    );
  };

  const renderSection = (section: WorkspaceSection) => {
    const roots = tree.folders.filter((folder) => section.rootIds.includes(folder.id));
    if (roots.length === 0) {
      return null;
    }

    return (
      <section key={section.id} className="workspace-tree-section">
        <h3 className="workspace-tree-section-label">{section.label}</h3>
        {roots.map((folder) => renderFolder(folder))}
      </section>
    );
  };

  const orphanRoots = tree.folders.filter(
    (folder) =>
      !folder.parent_id &&
      !SECTIONS.some((section) => section.rootIds.includes(folder.id)),
  );

  return (
    <div className="folder-tree">
      {SECTIONS.map((section) => renderSection(section))}
      {orphanRoots.length > 0 ? (
        <section className="workspace-tree-section">
          <h3 className="workspace-tree-section-label">Other</h3>
          {orphanRoots.map((folder) => renderFolder(folder))}
        </section>
      ) : null}
    </div>
  );
}