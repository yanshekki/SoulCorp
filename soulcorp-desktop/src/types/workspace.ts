export interface WorkspaceFolder {
  id: string;
  name: string;
  icon?: string | null;
  parent_id?: string | null;
  workspace_type: "company" | "agent" | "user" | "custom";
  owner_id: string;
  is_private: boolean;
}

export interface WorkspaceBlock {
  id: string;
  type: "text" | "heading" | "todo";
  content: string;
  checked?: boolean | null;
}

export interface WorkspacePage {
  id: string;
  title: string;
  folder_id: string;
  icon?: string | null;
  blocks: WorkspaceBlock[];
  last_edited_at: string;
  last_edited_by: string;
  version: number;
}

export interface WorkspacePageSummary {
  id: string;
  title: string;
  folder_id: string;
  last_edited_at: string;
  last_edited_by: string;
}

export interface WorkspaceTree {
  folders: WorkspaceFolder[];
  pages: WorkspacePageSummary[];
}

export interface WorkspaceSearchResult {
  page_id: string;
  title: string;
  folder_id: string;
  snippet: string;
  score: number;
}