import { useEffect, useRef } from "react";
import {
  deleteWorkspaceFile,
  deleteWorkspacePage,
  openWorkspaceFileExternally,
} from "../../services/workspaceClient";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceListItem } from "../../types/workspaceNav";
import { confirmDialog } from "../../utils/nativeDialog";
import { useI18n } from "../../i18n/I18nProvider";

interface WorkspaceContextMenuProps {
  item: WorkspaceListItem;
  x: number;
  y: number;
  onClose: () => void;
}

export function WorkspaceContextMenu({ item, x, y, onClose }: WorkspaceContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const togglePin = useWorkspaceStore((state) => state.togglePin);
  const openWorkspaceItem = useWorkspaceStore((state) => state.openWorkspaceItem);
  const removePageSummary = useWorkspaceStore((state) => state.removePageSummary);
  const removeFileSummary = useWorkspaceStore((state) => state.removeFileSummary);
  const loadFolderChildren = useWorkspaceStore((state) => state.loadFolderChildren);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);
  const pinnedIds = useWorkspaceStore((state) => state.pinnedIds);
  const isPinned = pinnedIds.includes(item.id);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleDelete = async () => {
    const confirmed = await confirmDialog(
      `Delete ${item.kind === "file" ? "file" : "page"} "${item.title}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    if (item.kind === "file") {
      await deleteWorkspaceFile(item.id);
      removeFileSummary(item.id);
    } else {
      await deleteWorkspacePage(item.id);
      removePageSummary(item.id);
    }
    await loadFolderChildren(item.folderId, true);
    onClose();
  };

  const handleOpenExternal = async () => {
    if (item.kind !== "file") {
      return;
    }
    await openWorkspaceFileExternally(item.id);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="ws-context-menu"
      style={{ top: y, left: x }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void openWorkspaceItem(item.id);
          onClose();
        }}
      >
        {t("workspace.ctx.open")}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          togglePin(item.id);
          onClose();
        }}
      >
        {isPinned ? t("workspace.unpin") : t("workspace.pin")}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setActiveView("browse");
          onClose();
        }}
      >
        {t("workspace.ctx.showBrowse")}
      </button>
      {item.kind === "file" ? (
        <button type="button" role="menuitem" onClick={() => void handleOpenExternal()}>
          {t("workspace.ctx.openExternal")}
        </button>
      ) : null}
      <button type="button" role="menuitem" className="danger" onClick={() => void handleDelete()}>
        {t("workspace.ctx.delete")}
      </button>
    </div>
  );
}