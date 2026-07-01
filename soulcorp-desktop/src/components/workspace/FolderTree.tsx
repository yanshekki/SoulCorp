import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import {
  createWorkspaceFolder,
  createWorkspacePage,
  deleteWorkspaceFolder,
  deleteWorkspacePage,
  listWorkspaceTree,
  reorderWorkspacePages,
} from "../../services/workspaceClient";
import { useGameStore } from "../../stores/gameStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceFolder, WorkspacePage, WorkspaceTemplate } from "../../types/workspace";

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

function sortPages<T extends { sort_order?: number; title: string }>(pages: T[]): T[] {
  return [...pages].sort((left, right) => {
    const leftOrder = left.sort_order ?? 0;
    const rightOrder = right.sort_order ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title);
  });
}

export function FolderTree() {
  const tree = useWorkspaceStore((state) => state.tree);
  const selectedPageId = useWorkspaceStore((state) => state.selectedPageId);
  const openingPageId = useWorkspaceStore((state) => state.openingPageId);
  const setTree = useWorkspaceStore((state) => state.setTree);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const removePageSummary = useWorkspaceStore((state) => state.removePageSummary);
  const removeFolder = useWorkspaceStore((state) => state.removeFolder);
  const openPage = useWorkspaceStore((state) => state.openPage);
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

  const pagesByFolder = useMemo(() => {
    const map = new Map<string, typeof tree.pages>();
    for (const page of tree.pages) {
      const current = map.get(page.folder_id) ?? [];
      current.push(page);
      map.set(page.folder_id, current);
    }
    for (const [folderId, pages] of map.entries()) {
      map.set(folderId, sortPages(pages));
    }
    return map;
  }, [tree.pages]);

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

  const refreshTree = async () => {
    const refreshed = await listWorkspaceTree();
    setTree(refreshed);
  };

  const toggleFolder = (folderId: string) => {
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
    await openPage(page.id);
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
      await refreshTree();
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
      await refreshTree();
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
      await refreshTree();
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePage = async (pageId: string, title: string) => {
    const confirmed = window.confirm(`Delete page "${title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteWorkspacePage(pageId);
      removePageSummary(pageId);
      await refreshTree();
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
      await refreshTree();
    } catch (error) {
      window.alert(String(error));
    } finally {
      setBusy(false);
    }
  };

  const movePage = async (folderId: string, pageId: string, direction: "up" | "down") => {
    const pages = pagesByFolder.get(folderId) ?? [];
    const index = pages.findIndex((page) => page.id === pageId);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) {
      return;
    }

    const nextOrder = [...pages];
    const [current] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, current);

    setBusy(true);
    try {
      const refreshed = await reorderWorkspacePages(
        folderId,
        nextOrder.map((page) => page.id),
      );
      setTree(refreshed);
    } finally {
      setBusy(false);
    }
  };

  const renderFolder = (folder: WorkspaceFolder, depth = 0) => {
    const pages = pagesByFolder.get(folder.id) ?? [];
    const children = childrenFor(folder.id);
    const isAgentFolder = folder.workspace_type === "agent";
    const isCollapsed = collapsedFolders.has(folder.id);
    const hasContents = pages.length > 0 || children.length > 0 || templateFolderId === folder.id;

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
        </div>

        {!isCollapsed ? (
          <>
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

            {pages.map((page, index) => (
              <div
                key={page.id}
                className={`page-row-wrap ${selectedPageId === page.id ? "active" : ""}${
                  openingPageId === page.id ? " opening" : ""
                }`}
              >
                <div className="page-row-order">
                  <button
                    type="button"
                    className="tiny-btn"
                    title="Move up"
                    disabled={busy || index === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      void movePage(folder.id, page.id, "up");
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="tiny-btn"
                    title="Move down"
                    disabled={busy || index === pages.length - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      void movePage(folder.id, page.id, "down");
                    }}
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  className={`page-row ${selectedPageId === page.id ? "active" : ""}`}
                  onClick={() => void openPage(page.id)}
                >
                  {page.title}
                </button>
                <button
                  type="button"
                  className="tiny-btn danger page-delete-btn"
                  title="Delete page"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeletePage(page.id, page.title);
                  }}
                >
                  ×
                </button>
              </div>
            ))}

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