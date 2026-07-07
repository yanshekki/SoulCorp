import { invoke } from "@tauri-apps/api/core";
import type {
  WorkspaceFile,
  WorkspaceFilePathResponse,
  WorkspaceFileSummary,
  WorkspaceFolder,
  WorkspaceFolderChildren,
  WorkspacePage,
  WorkspaceSnapshot,
  WorkspaceSummaries,
  WorkspaceTree,
} from "../types/workspace";

export async function getWorkspacePage(pageId: string): Promise<WorkspacePage> {
  return invoke<WorkspacePage>("get_workspace_page", { pageId });
}

export async function listWorkspaceTree(): Promise<WorkspaceTree> {
  return invoke<WorkspaceTree>("list_workspace_tree");
}

export async function initWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invoke<WorkspaceSnapshot>("init_workspace");
}

export async function listWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  return invoke<WorkspaceSnapshot>("list_workspace_snapshot");
}

export async function listWorkspaceSummaries(): Promise<WorkspaceSummaries> {
  return invoke<WorkspaceSummaries>("list_workspace_summaries");
}

export async function listWorkspaceFolderChildren(
  folderId: string,
): Promise<WorkspaceFolderChildren> {
  return invoke<WorkspaceFolderChildren>("list_workspace_folder_children", { folderId });
}

export async function resolveWorkspaceItems(itemIds: string[]): Promise<WorkspaceSummaries> {
  return invoke<WorkspaceSummaries>("resolve_workspace_items", {
    request: { item_ids: itemIds },
  });
}

export async function pickDefaultPageIdFromFolder(folderId: string): Promise<string | null> {
  const children = await listWorkspaceFolderChildren(folderId);
  if (children.pages.length === 0) {
    return null;
  }
  const welcome = children.pages.find((page) => page.title.includes("Welcome"));
  if (welcome) {
    return welcome.id;
  }
  const sorted = [...children.pages].sort((left, right) => {
    const leftOrder = left.sort_order ?? 0;
    const rightOrder = right.sort_order ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title);
  });
  return sorted[0]?.id ?? null;
}

export function pickDefaultPageId(tree: WorkspaceTree): string | null {
  if (tree.pages.length === 0) {
    return null;
  }
  const welcome = tree.pages.find((page) => page.title.includes("Welcome"));
  if (welcome) {
    return welcome.id;
  }
  const sorted = [...tree.pages].sort((left, right) => {
    const leftOrder = left.sort_order ?? 0;
    const rightOrder = right.sort_order ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title);
  });
  return sorted[0]?.id ?? null;
}

export async function refreshWorkspaceTree(reloadOpenPage = true): Promise<void> {
  const { useWorkspaceStore } = await import("../stores/workspaceStore");
  const store = useWorkspaceStore.getState();
  const tree = await listWorkspaceTree();
  store.setTree(tree);
  if (!reloadOpenPage) {
    return;
  }
  if (store.selectedFileId) {
    const stillExists = (tree.files ?? []).some((file) => file.id === store.selectedFileId);
    if (stillExists) {
      await store.openFile(store.selectedFileId);
    } else {
      store.setSelectedFile(null);
    }
    return;
  }
  if (store.selectedPageId) {
    const stillExists = tree.pages.some((page) => page.id === store.selectedPageId);
    if (stillExists) {
      await store.openPage(store.selectedPageId);
    } else {
      const fallback = pickDefaultPageId(tree);
      if (fallback) {
        await store.openPage(fallback);
      } else {
        store.setSelectedPage(null);
      }
    }
  }
}

export async function createWorkspaceFolder(
  parentId: string,
  name: string,
): Promise<WorkspaceFolder> {
  return invoke<WorkspaceFolder>("create_workspace_folder", {
    request: {
      parent_id: parentId,
      name,
    },
  });
}

export async function deleteWorkspacePage(pageId: string): Promise<void> {
  return invoke("delete_workspace_page", {
    request: { page_id: pageId },
  });
}

export async function deleteWorkspaceFolder(folderId: string): Promise<void> {
  return invoke("delete_workspace_folder", {
    request: { folder_id: folderId },
  });
}

export async function createWorkspacePage(
  folderId: string,
  title: string,
): Promise<WorkspacePage> {
  return invoke<WorkspacePage>("create_workspace_page", {
    request: {
      folder_id: folderId,
      title,
    },
  });
}

export async function reorderWorkspacePages(
  folderId: string,
  pageIds: string[],
): Promise<WorkspaceTree> {
  return invoke<WorkspaceTree>("reorder_workspace_pages", {
    request: {
      folder_id: folderId,
      page_ids: pageIds,
    },
  });
}

export async function reorderWorkspaceItems(
  folderId: string,
  itemIds: string[],
): Promise<WorkspaceTree> {
  return invoke<WorkspaceTree>("reorder_workspace_items", {
    request: {
      folder_id: folderId,
      item_ids: itemIds,
    },
  });
}

export async function importWorkspaceFiles(
  folderId: string,
  sourcePaths: string[],
): Promise<WorkspaceFileSummary[]> {
  return invoke<WorkspaceFileSummary[]>("import_workspace_files", {
    request: {
      folder_id: folderId,
      source_paths: sourcePaths,
    },
  });
}

export async function getWorkspaceFile(fileId: string): Promise<WorkspaceFile> {
  return invoke<WorkspaceFile>("get_workspace_file", { fileId });
}

export async function getWorkspaceFilePath(
  fileId: string,
): Promise<WorkspaceFilePathResponse> {
  return invoke<WorkspaceFilePathResponse>("get_workspace_file_path", { fileId });
}

export async function deleteWorkspaceFile(fileId: string): Promise<void> {
  return invoke("delete_workspace_file", {
    request: { file_id: fileId },
  });
}

export async function openWorkspaceFileExternally(fileId: string): Promise<void> {
  return invoke("open_workspace_file_externally", { fileId });
}

const SIDEBAR_WIDTH_KEY = "soulcorp-workspace-sidebar-width";

export function loadWorkspaceSidebarWidth(): number {
  const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = saved ? Number(saved) : 240;
  if (!Number.isFinite(parsed)) {
    return 240;
  }
  return Math.min(480, Math.max(220, parsed));
}

export function saveWorkspaceSidebarWidth(width: number): void {
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
}