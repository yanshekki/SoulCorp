import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceFolder, WorkspacePage, WorkspaceTree } from "../../types/workspace";

interface FolderTreeProps {
  onSelectPage: (pageId: string) => void;
}

export function FolderTree({ onSelectPage }: FolderTreeProps) {
  const tree = useWorkspaceStore((state) => state.tree);
  const selectedPageId = useWorkspaceStore((state) => state.selectedPageId);
  const setTree = useWorkspaceStore((state) => state.setTree);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const setSelectedPage = useWorkspaceStore((state) => state.setSelectedPage);

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
        </div>
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