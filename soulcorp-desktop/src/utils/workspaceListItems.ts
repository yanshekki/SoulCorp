import type {
  WorkspaceFileSummary,
  WorkspaceFolder,
  WorkspacePageSummary,
  WorkspaceTree,
} from "../types/workspace";
import type {
  WorkspaceItemFilter,
  WorkspaceListGroup,
  WorkspaceListItem,
  WorkspaceRecentEntry,
} from "../types/workspaceNav";
import { fileKindIcon, formatFileSize } from "./workspaceFileTypes";

const RECENT_LIMIT = 20;

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return date.toLocaleDateString();
}

export function folderLabelFor(
  folderId: string,
  folders: WorkspaceFolder[],
): string {
  const names: string[] = [];
  let currentId: string | null | undefined = folderId;
  const guard = new Set<string>();
  while (currentId && !guard.has(currentId)) {
    guard.add(currentId);
    const folder = folders.find((item) => item.id === currentId);
    if (!folder) {
      break;
    }
    names.unshift(folder.name);
    currentId = folder.parent_id;
  }
  return names.join(" / ") || "Workspace";
}

function pageToListItem(
  page: WorkspacePageSummary,
  tree: WorkspaceTree,
  pinnedIds: Set<string>,
): WorkspaceListItem {
  return {
    id: page.id,
    kind: "page",
    title: page.title,
    folderId: page.folder_id,
    folderLabel: folderLabelFor(page.folder_id, tree.folders),
    meta: formatRelativeTime(page.last_edited_at),
    icon: "📄",
    pinned: pinnedIds.has(page.id),
  };
}

function fileToListItem(
  file: WorkspaceFileSummary,
  tree: WorkspaceTree,
  pinnedIds: Set<string>,
): WorkspaceListItem {
  return {
    id: file.id,
    kind: "file",
    title: file.name,
    folderId: file.folder_id,
    folderLabel: folderLabelFor(file.folder_id, tree.folders),
    meta: formatFileSize(file.size_bytes),
    icon: fileKindIcon(file.file_kind),
    fileKind: file.file_kind,
    pinned: pinnedIds.has(file.id),
  };
}

export function filterWorkspaceItems(
  items: WorkspaceListItem[],
  filter: WorkspaceItemFilter,
): WorkspaceListItem[] {
  if (filter === "all") {
    return items;
  }
  if (filter === "pages") {
    return items.filter((item) => item.kind === "page");
  }
  return items.filter((item) => item.kind === "file");
}

export function buildAllListItems(
  tree: WorkspaceTree,
  pinnedIds: Set<string>,
): WorkspaceListItem[] {
  const pages = tree.pages.map((page) => pageToListItem(page, tree, pinnedIds));
  const files = (tree.files ?? []).map((file) => fileToListItem(file, tree, pinnedIds));
  return [...pages, ...files];
}

export function buildRecentItems(
  tree: WorkspaceTree,
  recent: WorkspaceRecentEntry[],
  pinnedIds: Set<string>,
  filter: WorkspaceItemFilter,
): WorkspaceListItem[] {
  const all = buildAllListItems(tree, pinnedIds);
  const byId = new Map(all.map((item) => [item.id, item]));
  const items: WorkspaceListItem[] = [];
  for (const entry of recent) {
    const item = byId.get(entry.id);
    if (item) {
      items.push(item);
    }
    if (items.length >= RECENT_LIMIT) {
      break;
    }
  }
  return filterWorkspaceItems(items, filter);
}

export function buildPinnedItems(
  tree: WorkspaceTree,
  pinnedIds: string[],
  filter: WorkspaceItemFilter,
): WorkspaceListItem[] {
  const all = buildAllListItems(tree, new Set(pinnedIds));
  const byId = new Map(all.map((item) => [item.id, item]));
  const items = pinnedIds
    .map((id) => byId.get(id))
    .filter((item): item is WorkspaceListItem => Boolean(item));
  return filterWorkspaceItems(items, filter);
}

export function buildFileItems(
  tree: WorkspaceTree,
  pinnedIds: Set<string>,
  filter: WorkspaceItemFilter,
): WorkspaceListItem[] {
  const files = (tree.files ?? [])
    .map((file) => fileToListItem(file, tree, pinnedIds))
    .sort((left, right) => right.meta.localeCompare(left.meta));
  return filterWorkspaceItems(files, filter);
}

function folderSubtreeIds(rootId: string, folders: WorkspaceFolder[]): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function buildProjectGroups(
  tree: WorkspaceTree,
  pinnedIds: Set<string>,
  filter: WorkspaceItemFilter,
): WorkspaceListGroup[] {
  const projectRoots = tree.folders.filter(
    (folder) =>
      folder.id === "folder-projects" ||
      (folder.workspace_type === "department" && folder.parent_id === "folder-teams"),
  );

  const groups: WorkspaceListGroup[] = [];
  for (const root of projectRoots) {
    const folderIds = folderSubtreeIds(root.id, tree.folders);
    const pages = tree.pages
      .filter((page) => folderIds.has(page.folder_id))
      .map((page) => pageToListItem(page, tree, pinnedIds));
    const files = (tree.files ?? [])
      .filter((file) => folderIds.has(file.folder_id))
      .map((file) => fileToListItem(file, tree, pinnedIds));
    const items = filterWorkspaceItems([...pages, ...files], filter);
    if (items.length > 0) {
      groups.push({
        id: root.id,
        label: root.name,
        icon: root.icon ?? "📁",
        items,
      });
    }
  }

  const customUnderCompany = tree.folders.filter(
    (folder) =>
      folder.workspace_type === "custom" &&
      (folder.parent_id === "folder-company" || folder.parent_id === "folder-projects"),
  );
  for (const folder of customUnderCompany) {
    const folderIds = folderSubtreeIds(folder.id, tree.folders);
    const pages = tree.pages
      .filter((page) => folderIds.has(page.folder_id))
      .map((page) => pageToListItem(page, tree, pinnedIds));
    const files = (tree.files ?? [])
      .filter((file) => folderIds.has(file.folder_id))
      .map((file) => fileToListItem(file, tree, pinnedIds));
    const items = filterWorkspaceItems([...pages, ...files], filter);
    if (items.length > 0) {
      groups.push({
        id: folder.id,
        label: folder.name,
        icon: folder.icon ?? "📂",
        items,
      });
    }
  }

  return groups;
}

export function buildAgentGroups(
  tree: WorkspaceTree,
  pinnedIds: Set<string>,
  filter: WorkspaceItemFilter,
): WorkspaceListGroup[] {
  const agentFolders = tree.folders
    .filter((folder) => folder.workspace_type === "agent")
    .sort((left, right) => left.name.localeCompare(right.name));

  const groups: WorkspaceListGroup[] = [];
  for (const folder of agentFolders) {
    const pages = tree.pages
      .filter((page) => page.folder_id === folder.id)
      .map((page) => pageToListItem(page, tree, pinnedIds));
    const files = (tree.files ?? [])
      .filter((file) => file.folder_id === folder.id)
      .map((file) => fileToListItem(file, tree, pinnedIds));
    const items = filterWorkspaceItems([...pages, ...files], filter);
    groups.push({
      id: folder.id,
      label: folder.name,
      icon: folder.icon ?? "🤖",
      items,
    });
  }
  return groups;
}

export function findListItemById(
  tree: WorkspaceTree,
  itemId: string,
  pinnedIds: Set<string>,
): WorkspaceListItem | null {
  const page = tree.pages.find((entry) => entry.id === itemId);
  if (page) {
    return pageToListItem(page, tree, pinnedIds);
  }
  const file = (tree.files ?? []).find((entry) => entry.id === itemId);
  if (file) {
    return fileToListItem(file, tree, pinnedIds);
  }
  return null;
}