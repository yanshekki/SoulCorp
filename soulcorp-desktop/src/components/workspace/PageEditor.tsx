import { invoke } from "@tauri-apps/api/core";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspacePage } from "../../types/workspace";
import { blocksFromRichDoc, richDocFromPage } from "./blockConversion";
import { PageLinks } from "./PageLinks";
import { TipTapEditor } from "./TipTapEditor";

interface PageEditorProps {
  onOpenPage?: (pageId: string) => void;
}

export function PageEditor({ onOpenPage }: PageEditorProps) {
  const selectedPage = useWorkspaceStore((state) => state.selectedPage);
  const setSelectedPage = useWorkspaceStore((state) => state.setSelectedPage);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const [title, setTitle] = useState("");
  const [richDoc, setRichDoc] = useState<JSONContent>({ type: "doc", content: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedPage) {
      return;
    }
    setTitle(selectedPage.title);
    setRichDoc(
      richDocFromPage(
        selectedPage.rich_doc as JSONContent | undefined,
        selectedPage.blocks,
      ),
    );
  }, [selectedPage]);

  if (!selectedPage) {
    return (
      <div className="page-editor empty">
        <p>Select or create a page from the folder tree.</p>
      </div>
    );
  }

  const savePage = async () => {
    setSaving(true);
    try {
      const blocks = blocksFromRichDoc(richDoc);
      const page = await invoke<WorkspacePage>("update_workspace_page", {
        request: {
          page_id: selectedPage.id,
          title,
          blocks,
          rich_doc: richDoc,
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

      <PageLinks
        page={selectedPage}
        onPageUpdated={setSelectedPage}
        onOpenPage={(pageId) => onOpenPage?.(pageId)}
      />

      <TipTapEditor value={richDoc} onChange={setRichDoc} />

      <footer className="page-meta">
        v{selectedPage.version} · last edited by {selectedPage.last_edited_by} · TipTap blocks
      </footer>
    </div>
  );
}