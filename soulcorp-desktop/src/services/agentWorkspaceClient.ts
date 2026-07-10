import { invoke } from "@tauri-apps/api/core";
import type { AgentMemoryView } from "../types/game";
import type {
  AgentWorkspaceActivityEntry,
  AgentWorkspaceContext,
  AgentWorkspacePageView,
  WorkspaceFolderChildren,
  WorkspacePage,
  WorkspaceSearchResult,
} from "../types/workspace";

export async function listAgentWorkspaceFolder(
  agentId: string,
): Promise<WorkspaceFolderChildren> {
  return invoke<WorkspaceFolderChildren>("agent_workspace_list_folder", { agentId });
}

export async function getAgentWorkspaceContext(
  agentId: string,
): Promise<AgentWorkspaceContext> {
  return invoke<AgentWorkspaceContext>("agent_workspace_get_context", { agentId });
}

export async function readAgentWorkspacePage(
  agentId: string,
  pageId: string,
): Promise<AgentWorkspacePageView> {
  return invoke<AgentWorkspacePageView>("agent_workspace_read_page", {
    request: { agent_id: agentId, page_id: pageId },
  });
}

export async function searchAgentWorkspace(
  agentId: string,
  query: string,
  limit = 20,
): Promise<WorkspaceSearchResult[]> {
  return invoke<WorkspaceSearchResult[]>("agent_workspace_search", {
    request: { agent_id: agentId, query, limit },
  });
}

export async function createAgentWorkspacePage(
  agentId: string,
  title: string,
  content?: string,
): Promise<WorkspacePage> {
  return invoke<WorkspacePage>("agent_workspace_create_page", {
    request: { agent_id: agentId, title, content: content ?? null },
  });
}

export async function appendAgentWorkspacePage(
  agentId: string,
  pageId: string,
  heading: string,
  lines: string[],
): Promise<WorkspacePage> {
  return invoke<WorkspacePage>("agent_workspace_append_page", {
    request: { agent_id: agentId, page_id: pageId, heading, lines },
  });
}

export async function appendAgentWorkspaceJournal(
  agentId: string,
  journalTitle: string,
  heading: string,
  lines: string[],
): Promise<WorkspacePage> {
  return invoke<WorkspacePage>("agent_workspace_append_journal", {
    request: {
      agent_id: agentId,
      journal_title: journalTitle,
      heading,
      lines,
    },
  });
}

export async function writeAgentWorkspaceDeliverable(
  agentId: string,
  title: string,
  content: string,
): Promise<WorkspacePage> {
  return invoke<WorkspacePage>("agent_workspace_write_deliverable", {
    request: { agent_id: agentId, title, content },
  });
}

export async function listAgentWorkspaceActivity(
  limit = 30,
): Promise<AgentWorkspaceActivityEntry[]> {
  return invoke<AgentWorkspaceActivityEntry[]>("agent_workspace_list_activity", {
    limit,
  });
}

export async function getAgentMemory(agentId: string): Promise<AgentMemoryView> {
  return invoke<AgentMemoryView>("agent_workspace_get_memory", { agentId });
}

export async function compressAgentMemory(agentId: string): Promise<AgentMemoryView> {
  return invoke<AgentMemoryView>("agent_workspace_compress_memory", { agentId });
}