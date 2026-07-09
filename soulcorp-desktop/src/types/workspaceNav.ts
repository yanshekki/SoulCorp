import type { WorkspaceFileKind } from "./workspace";

export type WorkspaceNavView =
  | "recent"
  | "pinned"
  | "projects"
  | "agents"
  | "files"
  | "browse";

export type WorkspaceItemFilter = "all" | "pages" | "files";

export interface WorkspaceRecentEntry {
  id: string;
  openedAt: string;
}

export interface WorkspaceListItem {
  id: string;
  kind: "page" | "file";
  title: string;
  folderId: string;
  folderLabel: string;
  meta: string;
  icon: string;
  fileKind?: WorkspaceFileKind;
  pinned: boolean;
}

export interface WorkspaceListGroup {
  id: string;
  label: string;
  icon?: string;
  items: WorkspaceListItem[];
  subgroups?: WorkspaceListGroup[];
}

export const WORKSPACE_NAV_VIEWS: Array<{
  id: WorkspaceNavView;
  label: string;
  icon: string;
}> = [
  { id: "recent", label: "Recent", icon: "🕐" },
  { id: "pinned", label: "Pinned", icon: "⭐" },
  { id: "projects", label: "Projects", icon: "📁" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "files", label: "Files", icon: "📎" },
  { id: "browse", label: "Browse", icon: "🌳" },
];