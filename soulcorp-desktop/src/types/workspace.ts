export interface WorkspaceFolder {
  id: string;
  name: string;
  icon?: string | null;
  parent_id?: string | null;
  workspace_type: "company" | "department" | "agent" | "user" | "custom";
  owner_id: string;
  is_private: boolean;
  sort_order?: number;
}

export interface WorkspaceBlock {
  id: string;
  type: "text" | "heading" | "todo";
  content: string;
  checked?: boolean | null;
}

export interface LinkedEntity {
  entity_type: "agent" | "project" | "meeting" | "event" | string;
  id: string;
  title: string;
}

export interface LinkableEntity {
  entity_type: string;
  id: string;
  title: string;
  subtitle?: string | null;
}

export interface PageBacklink {
  page_id: string;
  title: string;
  folder_id: string;
}

export interface WorkspacePage {
  id: string;
  title: string;
  folder_id: string;
  icon?: string | null;
  blocks: WorkspaceBlock[];
  rich_doc?: Record<string, unknown> | null;
  linked_entities: LinkedEntity[];
  last_edited_at: string;
  last_edited_by: string;
  version: number;
  sort_order?: number;
}

export interface WorkspacePageSummary {
  id: string;
  title: string;
  folder_id: string;
  last_edited_at: string;
  last_edited_by: string;
  sort_order?: number;
}

export type WorkspaceFileKind =
  | "image"
  | "document"
  | "pdf"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "video"
  | "audio"
  | "text"
  | "other";

export interface WorkspaceFileSummary {
  id: string;
  folder_id: string;
  name: string;
  extension: string;
  mime_type: string;
  file_kind: WorkspaceFileKind;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string;
  sort_order?: number;
}

export interface WorkspaceFile extends WorkspaceFileSummary {}

export interface WorkspaceFilePathResponse {
  file_id: string;
  absolute_path: string;
  mime_type: string;
  file_kind: WorkspaceFileKind;
}

export interface WorkspaceTree {
  folders: WorkspaceFolder[];
  pages: WorkspacePageSummary[];
  files: WorkspaceFileSummary[];
}

export interface WorkspaceSnapshot {
  folders: WorkspaceFolder[];
  page_count: number;
  file_count: number;
}

export interface WorkspaceSummaries {
  pages: WorkspacePageSummary[];
  files: WorkspaceFileSummary[];
}

export interface WorkspaceFolderChildren {
  folder_id: string;
  pages: WorkspacePageSummary[];
  files: WorkspaceFileSummary[];
}

export interface WorkspaceSearchResult {
  page_id: string;
  title: string;
  folder_id: string;
  snippet: string;
  score: number;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
}

export interface PageVersionSummary {
  version: number;
  saved_at: string;
  editor: string;
  title: string;
}

export interface PageComment {
  id: string;
  page_id: string;
  author: string;
  content: string;
  mentions: string[];
  created_at: string;
}

export interface WorkspaceDatabaseView {
  id: string;
  title: string;
  description: string;
  columns: string[];
  rows: string[][];
}

export interface WorkspacePresenceEntry {
  page_id: string;
  editor: string;
  updated_at: string;
}

export interface AgentWorkspacePageView {
  page_id: string;
  title: string;
  folder_id: string;
  text: string;
  last_edited_at: string;
  last_edited_by: string;
}

export interface AgentWorkspaceActivityEntry {
  agent_id: string;
  agent_name: string;
  page_id: string;
  title: string;
  folder_id: string;
  last_edited_at: string;
  action: string;
}

export interface AgentWorkspaceContext {
  agent_id: string;
  agent_name: string;
  folder_id: string;
  pages: WorkspacePageSummary[];
  files: WorkspaceFileSummary[];
  recent_edits: AgentWorkspaceActivityEntry[];
}