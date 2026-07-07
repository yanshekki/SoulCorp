import type { WorkspaceFileKind } from "../types/workspace";

export function fileKindIcon(kind: WorkspaceFileKind): string {
  switch (kind) {
    case "image":
      return "🖼";
    case "pdf":
      return "📕";
    case "document":
      return "📄";
    case "spreadsheet":
      return "📊";
    case "presentation":
      return "📽";
    case "archive":
      return "🗜";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "text":
      return "📝";
    default:
      return "📎";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function isWorkspaceFileId(id: string): boolean {
  return id.startsWith("file-");
}