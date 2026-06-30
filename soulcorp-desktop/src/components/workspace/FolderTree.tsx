import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type {
  WorkspaceFolder,
  WorkspacePage,
  WorkspaceTemplate,
  WorkspaceTree,
} from "../../types/workspace";

interface FolderTreeProps {
  onSelectPage: (pageId: string) => void;
}

export function FolderTree({ onSelectPage }: FolderTreeProps) {
  const tree = useWorkspaceStore((state) => state.tree);
  const selectedPageId = useWorkspaceStore((state) => state.selectedPageId);
  const setTree = useWorkspaceStore((state) => state.setTree);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const setSelectedPage = useWorkspaceStore((state) => state.setSelectedPage);
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [templateFolderId, setTemplateFolderId] = useState<string | null>(null);

  useEffect(() => {
    void invoke<WorkspaceTemplate[]>("list_workspace_templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const roots = useMemo(
    () => tree.folders.filter((folder) => !folder.parent_id),
    [tree.folders],
  );

  const pagesByFolder = useMemo(() => {
    const map = new Map<string, typeof tree.pages>();
    for (const page of tree.pages) {
      const current = map.get(page.folder_id) ?? [];
      current.push(page);
      map.set(page.folder_id, current);
    }
    return map;
  }, [tree.pages]);

  const childrenFor = (folderId: string) =>
    tree.folders.filter((folder) => folder.parent_id === folderId);

  const createFromTemplate = async (folderId: string, templateId: string) => {
    const page = await invoke<WorkspacePage>("create_page_from_template_cmd", {
      request: {
        folder_id: folderId,
        template_id: templateId,
        title: null,
      },
    });
    const refreshed = await invoke<WorkspaceTree>("list_workspace_tree");
    setTree(refreshed);
    upsertPageSummary({
      id: page.id,
      title: page.title,
      folder_id: page.folder_id,
      last_edited_at: page.last_edited_at,
      last_edited_by: page.last_edited_by,
    });
    setSelectedPage(page);
    onSelectPage(page.id);
    setTemplateFolderId(null);
  };

  const createPage = async (folderId: string) => {
    const page = await invoke<WorkspacePage>("create_workspace_page", {
      request: {
        folder_id: folderId,
        title: "Untitled Page",
      },
    });
    const refreshed = await invoke<WorkspaceTree>("list_workspace_tree");
    setTree(refreshed);
    upsertPageSummary({
      id: page.id,
      title: page.title,
      folder_id: page.folder_id,
      last_edited_at: page.last_edited_at,
      last_edited_by: page.last_edited_by,
    });
    setSelectedPage(page);
    onSelectPage(page.id);
  };

  const renderFolder = (folder: WorkspaceFolder, depth = 0) => {
    const pages = pagesByFolder.get(folder.id) ?? [];
    const children = childrenFor(folder.id);

    return (
      <div key={folder.id} className="folder-group" style={{ paddingLeft: depth * 12 }}>
        <div className="folder-row">
          <span>
            {folder.icon ?? "📂"} {folder.name}
          </span>
          <button type="button" className="tiny-btn" onClick={() => void createPage(folder.id)}>
            +
          </button>
          <button
            type="button"
            className="tiny-btn"
            onClick={() =>
              setTemplateFolderId((current) => (current === folder.id ? null : folder.id))
            }
          >
            T
          </button>
        </div>
        {templateFolderId === folder.id ? (
          <div className="template-picker">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="template-chip"
                onClick={() => void createFromTemplate(folder.id, template.id)}
              >
                {template.icon ?? "📄"} {template.name}
              </button>
            ))}
          </div>
        ) : null}
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            className={`page-row ${selectedPageId === page.id ? "active" : ""}`}
            onClick={() => onSelectPage(page.id)}
          >
            {page.title}
          </button>
        ))}
        {children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return <div className="folder-tree">{roots.map((folder) => renderFolder(folder))}</div>;
}