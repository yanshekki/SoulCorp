import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceFolder, WorkspacePage, WorkspaceTree } from "../types/workspace";

export async function getWorkspacePage(pageId: string): Promise<WorkspacePage> {
  return invoke<WorkspacePage>("get_workspace_page", { pageId });
}

export async function listWorkspaceTree(): Promise<WorkspaceTree> {
  return invoke<WorkspaceTree>("list_workspace_tree");
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
  if (reloadOpenPage && store.selectedPageId) {
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

const SIDEBAR_WIDTH_KEY = "soulcorp-workspace-sidebar-width";

export function loadWorkspaceSidebarWidth(): number {
  const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  const parsed = saved ? Number(saved) : 300;
  if (!Number.isFinite(parsed)) {
    return 300;
  }
  return Math.min(480, Math.max(220, parsed));
}

export function saveWorkspaceSidebarWidth(width: number): void {
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
}