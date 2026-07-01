import { invoke } from "@tauri-apps/api/core";
import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteWorkspacePage,
  listWorkspaceTree,
} from "../../services/workspaceClient";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspacePage, WorkspacePresenceEntry } from "../../types/workspace";
import { blocksFromRichDoc, richDocFromPage } from "./blockConversion";
import { PageComments } from "./PageComments";
import { PageLinks } from "./PageLinks";
import { PageVersionHistory } from "./PageVersionHistory";
import { TipTapEditor } from "./TipTapEditor";

const AUTO_SAVE_DELAY_MS = 1500;

function pageSnapshot(title: string, richDoc: JSONContent): string {
  return JSON.stringify({ title, richDoc });
}

export function PageEditor() {
  const selectedPage = useWorkspaceStore((state) => state.selectedPage);
  const openingPageId = useWorkspaceStore((state) => state.openingPageId);
  const pageOpenError = useWorkspaceStore((state) => state.pageOpenError);
  const openPage = useWorkspaceStore((state) => state.openPage);
  const setSelectedPage = useWorkspaceStore((state) => state.setSelectedPage);
  const upsertPageSummary = useWorkspaceStore((state) => state.upsertPageSummary);
  const removePageSummary = useWorkspaceStore((state) => state.removePageSummary);
  const setTree = useWorkspaceStore((state) => state.setTree);
  const [title, setTitle] = useState("");
  const [richDoc, setRichDoc] = useState<JSONContent>({ type: "doc", content: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
  const [presence, setPresence] = useState<WorkspacePresenceEntry[]>([]);
  const lastSavedSnapshotRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savePage = useCallback(
    async (auto = false) => {
      if (!selectedPage || saving) {
        return;
      }
      const savingPageId = selectedPage.id;
      setSaving(true);
      setSaveError(null);
      if (!auto) {
        setSaveStatus("saving");
      }
      try {
        const blocks = blocksFromRichDoc(richDoc);
        const page = await invoke<WorkspacePage>("update_workspace_page", {
          request: {
            page_id: savingPageId,
            title,
            blocks,
            rich_doc: richDoc,
            last_edited_by: "player",
          },
        });
        if (useWorkspaceStore.getState().selectedPage?.id !== savingPageId) {
          return;
        }
        setSelectedPage(page);
        upsertPageSummary({
          id: page.id,
          title: page.title,
          folder_id: page.folder_id,
          last_edited_at: page.last_edited_at,
          last_edited_by: page.last_edited_by,
          sort_order: page.sort_order,
        });
        lastSavedSnapshotRef.current = pageSnapshot(title, richDoc);
        setSaveStatus("saved");
        void invoke("set_workspace_presence", {
          pageId: page.id,
          editor: "player",
        });
      } catch (error) {
        const message = String(error);
        setSaveError(message);
        setSaveStatus("unsaved");
        if (!auto) {
          window.alert(`Could not save page: ${message}`);
        }
      } finally {
        setSaving(false);
      }
    },
    [richDoc, saving, selectedPage, setSelectedPage, title, upsertPageSummary],
  );

  useEffect(() => {
    if (!selectedPage) {
      return;
    }
    const loadedRichDoc = richDocFromPage(
      selectedPage.rich_doc as JSONContent | undefined,
      selectedPage.blocks,
    );
    setTitle(selectedPage.title);
    setRichDoc(loadedRichDoc);
    lastSavedSnapshotRef.current = pageSnapshot(selectedPage.title, loadedRichDoc);
    setSaveStatus("saved");
    setSaveError(null);

    void invoke("set_workspace_presence", {
      pageId: selectedPage.id,
      editor: "player",
    });
    void invoke<WorkspacePresenceEntry[]>("get_workspace_presence", {
      pageId: selectedPage.id,
    })
      .then(setPresence)
      .catch(() => setPresence([]));

    return () => {
      void invoke("clear_workspace_presence", { editor: "player" });
    };
  }, [selectedPage]);

  useEffect(() => {
    if (!selectedPage) {
      return;
    }
    const currentSnapshot = pageSnapshot(title, richDoc);
    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }
    setSaveStatus("unsaved");
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      void savePage(true);
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [title, richDoc, selectedPage, savePage]);

  if (openingPageId && !selectedPage) {
    return (
      <div className="page-editor empty">
        <p>Loading page...</p>
      </div>
    );
  }

  if (!selectedPage) {
    return (
      <div className="page-editor empty">
        {pageOpenError ? (
          <p className="page-open-error">Could not open page: {pageOpenError}</p>
        ) : (
          <p>Select or create a page from the folder tree.</p>
        )}
      </div>
    );
  }

  const deletePage = async () => {
    const confirmed = window.confirm(`Delete "${title || selectedPage.title}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setSaving(true);
    try {
      await deleteWorkspacePage(selectedPage.id);
      removePageSummary(selectedPage.id);
      setSelectedPage(null);
      const refreshed = await listWorkspaceTree();
      setTree(refreshed);
    } finally {
      setSaving(false);
    }
  };

  const handleRestored = (page: WorkspacePage) => {
    setSelectedPage(page);
    setTitle(page.title);
    const restoredRichDoc = richDocFromPage(
      page.rich_doc as JSONContent | undefined,
      page.blocks,
    );
    setRichDoc(restoredRichDoc);
    lastSavedSnapshotRef.current = pageSnapshot(page.title, restoredRichDoc);
    setSaveStatus("saved");
    upsertPageSummary({
      id: page.id,
      title: page.title,
      folder_id: page.folder_id,
      last_edited_at: page.last_edited_at,
      last_edited_by: page.last_edited_by,
      sort_order: page.sort_order,
    });
  };

  const saveLabel =
    saveStatus === "saving" || saving
      ? "Saving..."
      : saveStatus === "unsaved"
        ? "Save"
        : "Saved";

  return (
    <div className="page-editor">
      <header className="page-editor-header">
        <input
          className="page-title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="page-editor-actions">
          <span className={`page-save-status page-save-status-${saveStatus}`}>{saveLabel}</span>
          <button
            type="button"
            onClick={() => void savePage()}
            disabled={saving || saveStatus === "saved"}
          >
            Save
          </button>
          <button
            type="button"
            className="danger-btn"
            disabled={saving}
            onClick={() => void deletePage()}
          >
            Delete
          </button>
        </div>
      </header>

      {saveError ? <p className="page-save-error">{saveError}</p> : null}

      {presence.length > 0 ? (
        <p className="workspace-presence muted">
          Viewing: {presence.map((entry) => entry.editor).join(", ")}
        </p>
      ) : null}

      <PageLinks
        page={selectedPage}
        onPageUpdated={setSelectedPage}
        onOpenPage={(pageId) => void openPage(pageId)}
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