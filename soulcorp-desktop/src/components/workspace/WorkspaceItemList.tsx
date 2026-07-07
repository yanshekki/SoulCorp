import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, type ReactNode } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceListGroup, WorkspaceListItem } from "../../types/workspaceNav";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";

const VIRTUALIZE_THRESHOLD = 32;
const ROW_HEIGHT = 44;

interface WorkspaceItemListProps {
  items?: WorkspaceListItem[];
  groups?: WorkspaceListGroup[];
  emptyLabel?: string;
}

interface ContextState {
  item: WorkspaceListItem;
  x: number;
  y: number;
}

export function WorkspaceItemList({
  items,
  groups,
  emptyLabel = "Nothing here yet",
}: WorkspaceItemListProps) {
  const selectedPageId = useWorkspaceStore((state) => state.selectedPageId);
  const selectedFileId = useWorkspaceStore((state) => state.selectedFileId);
  const openingPageId = useWorkspaceStore((state) => state.openingPageId);
  const openingFileId = useWorkspaceStore((state) => state.openingFileId);
  const openWorkspaceItem = useWorkspaceStore((state) => state.openWorkspaceItem);
  const togglePin = useWorkspaceStore((state) => state.togglePin);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);

  const renderRow = (item: WorkspaceListItem) => {
    const isActive =
      item.kind === "page" ? selectedPageId === item.id : selectedFileId === item.id;
    const isOpening =
      item.kind === "page" ? openingPageId === item.id : openingFileId === item.id;

    return (
      <div
        key={item.id}
        className={`ws-item-row-wrap${isActive ? " active" : ""}${isOpening ? " opening" : ""}`}
      >
        <button
          type="button"
          className="ws-item-row"
          onClick={() => void openWorkspaceItem(item.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ item, x: event.clientX, y: event.clientY });
          }}
        >
          <span className="ws-item-row-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="ws-item-row-body">
            <span className="ws-item-row-title">{item.title}</span>
            <span className="ws-item-row-meta">{item.meta}</span>
          </span>
        </button>
        <button
          type="button"
          className={`ws-item-pin-btn${item.pinned ? " pinned" : ""}`}
          title={item.pinned ? "Unpin" : "Pin"}
          onClick={(event) => {
            event.stopPropagation();
            togglePin(item.id);
          }}
        >
          {item.pinned ? "★" : "☆"}
        </button>
      </div>
    );
  };

  if (groups && groups.length > 0) {
    return (
      <div className="ws-item-list ws-item-list--grouped">
        {groups.map((group) => (
          <section key={group.id} className="ws-item-group">
            <header className="ws-item-group-header">
              <span aria-hidden="true">{group.icon ?? "📁"}</span>
              <span>{group.label}</span>
              <span className="ws-item-group-count">{group.items.length}</span>
            </header>
            <div className="ws-item-group-items">
              {group.items.length >= VIRTUALIZE_THRESHOLD ? (
                <VirtualItemRows items={group.items} renderRow={renderRow} />
              ) : (
                group.items.map((item) => renderRow(item))
              )}
            </div>
          </section>
        ))}
        {contextMenu ? (
          <WorkspaceContextMenu
            item={contextMenu.item}
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
          />
        ) : null}
      </div>
    );
  }

  const flatItems = items ?? [];
  if (flatItems.length === 0) {
    return <p className="ws-item-list-empty muted">{emptyLabel}</p>;
  }

  return (
    <>
      {flatItems.length >= VIRTUALIZE_THRESHOLD ? (
        <VirtualItemRows items={flatItems} renderRow={renderRow} />
      ) : (
        <div className="ws-item-list">{flatItems.map((item) => renderRow(item))}</div>
      )}
      {contextMenu ? (
        <WorkspaceContextMenu
          item={contextMenu.item}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </>
  );
}

function VirtualItemRows({
  items,
  renderRow,
}: {
  items: WorkspaceListItem[];
  renderRow: (item: WorkspaceListItem) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current?.closest(".ws-nav-content") ?? null,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div
      ref={listRef}
      className="ws-item-list ws-item-list--virtual"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const item = items[virtualRow.index];
        return (
          <div
            key={item.id}
            className="ws-item-virtual-row"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {renderRow(item)}
          </div>
        );
      })}
    </div>
  );
}