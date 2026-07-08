import { listAgentWorkspaceFolder } from "../services/agentWorkspaceClient";
import { listWorkspaceFolderChildren } from "../services/workspaceClient";
import { useGameStore } from "../stores/gameStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { WorkspacePageSummary } from "../types/workspace";
import { departmentFolderId } from "./workspaceFolderIds";

function pickPageIdFromSummaries(pages: WorkspacePageSummary[]): string | null {
  if (pages.length === 0) {
    return null;
  }
  const welcome = pages.find((page) => page.title.includes("Welcome"));
  if (welcome) {
    return welcome.id;
  }
  const sorted = [...pages].sort((left, right) => {
    const leftOrder = left.sort_order ?? 0;
    const rightOrder = right.sort_order ?? 0;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title);
  });
  return sorted[0]?.id ?? null;
}

export async function openWorkspacePage(pageId: string, label?: string): Promise<void> {
  try {
    await useWorkspaceStore.getState().openPage(pageId);
    useGameStore.getState().setActivePanel("workspace");
    useGameStore.getState().setStatusMessage(
      label ? `Opened ${label} in Workspace.` : "Opened page in Workspace.",
    );
  } catch (error) {
    useGameStore.getState().setStatusMessage(String(error));
  }
}

export async function openWorkspaceFolder(folderId: string, label?: string): Promise<void> {
  try {
    const children = await listWorkspaceFolderChildren(folderId);
    const pageId = pickPageIdFromSummaries(children.pages);
    if (!pageId) {
      useGameStore.getState().setActivePanel("workspace");
      useWorkspaceStore.getState().setActiveView("browse");
      useGameStore.getState().setStatusMessage(
        label
          ? `${label} has no pages yet — browse in Workspace.`
          : "Folder has no pages yet — browse in Workspace.",
      );
      return;
    }
    await openWorkspacePage(pageId, label);
  } catch (error) {
    useGameStore.getState().setStatusMessage(String(error));
  }
}

export async function openAgentWorkspace(agentId: string, label?: string): Promise<void> {
  try {
    const folder = await listAgentWorkspaceFolder(agentId);
    const pageId = pickPageIdFromSummaries(folder.pages);
    if (!pageId) {
      useGameStore.getState().setActivePanel("workspace");
      useWorkspaceStore.getState().setActiveView("agents");
      useGameStore.getState().setStatusMessage(
        label
          ? `${label}'s workspace is empty — browse agents in Workspace.`
          : "Agent workspace is empty — browse agents in Workspace.",
      );
      return;
    }
    await openWorkspacePage(pageId, label ? `${label}'s workspace` : undefined);
  } catch (error) {
    useGameStore.getState().setStatusMessage(String(error));
  }
}

export async function openDepartmentWorkspace(department: string, label?: string): Promise<void> {
  await openWorkspaceFolder(departmentFolderId(department), label ?? `${department} docs`);
}