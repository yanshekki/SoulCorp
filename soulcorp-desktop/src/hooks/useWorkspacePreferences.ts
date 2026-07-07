import type {
  WorkspaceNavView,
  WorkspaceRecentEntry,
} from "../types/workspaceNav";

const RECENT_LIMIT = 20;

function prefsKey(companyId: string | null, suffix: string): string {
  return `soulcorp-workspace-${suffix}-${companyId ?? "none"}`;
}

export function loadWorkspaceActiveView(companyId: string | null): WorkspaceNavView {
  try {
    const raw = localStorage.getItem(prefsKey(companyId, "active-view"));
    if (
      raw === "recent" ||
      raw === "pinned" ||
      raw === "projects" ||
      raw === "agents" ||
      raw === "files" ||
      raw === "browse"
    ) {
      return raw;
    }
  } catch {
    // ignore
  }
  return "recent";
}

export function saveWorkspaceActiveView(
  companyId: string | null,
  view: WorkspaceNavView,
): void {
  localStorage.setItem(prefsKey(companyId, "active-view"), view);
}

export function loadWorkspacePinnedIds(companyId: string | null): string[] {
  try {
    const raw = localStorage.getItem(prefsKey(companyId, "pinned"));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkspacePinnedIds(
  companyId: string | null,
  pinnedIds: string[],
): void {
  localStorage.setItem(prefsKey(companyId, "pinned"), JSON.stringify(pinnedIds));
}

export function loadWorkspaceRecent(companyId: string | null): WorkspaceRecentEntry[] {
  try {
    const raw = localStorage.getItem(prefsKey(companyId, "recent"));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as WorkspaceRecentEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry) => typeof entry?.id === "string" && typeof entry?.openedAt === "string",
    );
  } catch {
    return [];
  }
}

export function saveWorkspaceRecent(
  companyId: string | null,
  recent: WorkspaceRecentEntry[],
): void {
  localStorage.setItem(prefsKey(companyId, "recent"), JSON.stringify(recent));
}

export function pushWorkspaceRecent(
  recent: WorkspaceRecentEntry[],
  itemId: string,
): WorkspaceRecentEntry[] {
  const next = [
    { id: itemId, openedAt: new Date().toISOString() },
    ...recent.filter((entry) => entry.id !== itemId),
  ];
  return next.slice(0, RECENT_LIMIT);
}

export function loadWorkspaceOrganizeMode(companyId: string | null): boolean {
  try {
    return localStorage.getItem(prefsKey(companyId, "organize")) === "1";
  } catch {
    return false;
  }
}

export function saveWorkspaceOrganizeMode(
  companyId: string | null,
  enabled: boolean,
): void {
  localStorage.setItem(prefsKey(companyId, "organize"), enabled ? "1" : "0");
}