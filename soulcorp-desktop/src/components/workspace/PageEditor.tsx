import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceBlock, WorkspacePage } from "../../types/workspace";

export function PageEditor() {
  const selectedPage = useWorkspaceStore((state) => state.selectedPage);
  const setSelectedPage = useWorkspaceStore((state) => state.setSelectedPage);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<WorkspaceBlock[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedPage) return;
    setTitle(selectedPage.title);
    setBlocks(selectedPage.blocks);
  }, [selectedPage]);

  if (!selectedPage) {
    return (
      <div className="page-editor empty">
        <p>Select or create a page from the folder tree.</p>
      </div>
    );
  }

  const updateBlock = (blockId: string, patch: Partial<WorkspaceBlock>) => {
    setBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
    );
  };

  const addBlock = (type: WorkspaceBlock["type"]) => {
    setBlocks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type,
        content: type === "heading" ? "New heading" : "New block",
        checked: type === "todo" ? false : undefined,
      },
    ]);
  };

  const savePage = async () => {
    if (!selectedPage) return;
    setSaving(true);
    try {
      const page = await invoke<WorkspacePage>("update_workspace_page", {
        request: {
          page_id: selectedPage.id,
          title,
          blocks,
          last_edited_by: "player",
        },
      });
      setSelectedPage(page);
      upsertPageSummary({
        id: page.id,
        title: page.title,
        folder_id: page.folder_id,
        last_edited_at: page.last_edited_at,
        last_edited_by: page.last_edited_by,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-editor">
      <header className="page-editor-header">
        <input
          className="page-title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="button" onClick={() => void savePage()} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </header>

      <div className="block-toolbar">
        <button type="button" onClick={() => addBlock("heading")}>
          + Heading
        </button>
        <button type="button" onClick={() => addBlock("text")}>
          + Text
        </button>
        <button type="button" onClick={() => addBlock("todo")}>
          + Todo
        </button>
      </div>

      <div className="block-list">
        {blocks.map((block) => (
          <div key={block.id} className={`block-item block-${block.type}`}>
            {block.type === "todo" ? (
              <label className="todo-block">
                <input
                  type="checkbox"
                  checked={Boolean(block.checked)}
                  onChange={(event) =>
                    updateBlock(block.id, { checked: event.target.checked })
                  }
                />
                <input
                  value={block.content}
                  onChange={(event) => updateBlock(block.id, { content: event.target.value })}
                />
              </label>
            ) : (
              <input
                className={block.type === "heading" ? "heading-input" : "text-input"}
                value={block.content}
                onChange={(event) => updateBlock(block.id, { content: event.target.value })}
              />
            )}
          </div>
        ))}
      </div>

      <footer className="page-meta">
        v{selectedPage.version} · last edited by {selectedPage.last_edited_by}
      </footer>
    </div>
  );
}