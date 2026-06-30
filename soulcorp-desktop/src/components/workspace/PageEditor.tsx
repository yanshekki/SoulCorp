import { invoke } from "@tauri-apps/api/core";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspacePage, WorkspacePresenceEntry } from "../../types/workspace";
import { blocksFromRichDoc, richDocFromPage } from "./blockConversion";
import { PageComments } from "./PageComments";
import { PageLinks } from "./PageLinks";
import { PageVersionHistory } from "./PageVersionHistory";
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
  const [presence, setPresence] = useState<WorkspacePresenceEntry[]>([]);

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
    void invoke("set_workspace_presence", {
      page_id: selectedPage.id,
      editor: "player",
    });
    void invoke<WorkspacePresenceEntry[]>("get_workspace_presence", {
      page_id: selectedPage.id,
    })
      .then(setPresence)
      .catch(() => setPresence([]));
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
      void invoke("set_workspace_presence", {
        page_id: page.id,
        editor: "player",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRestored = (page: WorkspacePage) => {
    setSelectedPage(page);
    setTitle(page.title);
    setRichDoc(
      richDocFromPage(page.rich_doc as JSONContent | undefined, page.blocks),
    );
    upsertPageSummary({
      id: page.id,
      title: page.title,
      folder_id: page.folder_id,
      last_edited_at: page.last_edited_at,
      last_edited_by: page.last_edited_by,
    });
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

      {presence.length > 0 ? (
        <p className="workspace-presence muted">
          Viewing: {presence.map((entry) => entry.editor).join(", ")}
        </p>
      ) : null}

      <PageLinks
        page={selectedPage}
        onPageUpdated={setSelectedPage}
        onOpenPage={(pageId) => onOpenPage?.(pageId)}
      />

      <TipTapEditor value={richDoc} onChange={setRichDoc} />

      <PageVersionHistory pageId={selectedPage.id} onRestored={handleRestored} />
      <PageComments pageId={selectedPage.id} />

      <footer className="page-meta">
        v{selectedPage.version} · last edited by {selectedPage.last_edited_by} · TipTap blocks
      </footer>
    </div>
  );
}