import { invoke } from "../../utils/tauriInvoke";
import type { JSONContent } from "@tiptap/core";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteWorkspacePage,
  listWorkspaceTree,
} from "../../services/workspaceClient";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspacePage, WorkspacePresenceEntry } from "../../types/workspace";
import { useWorkspaceEditorViewport } from "../../hooks/useWorkspaceEditorViewport";
import { alertDialog, confirmDialog } from "../../utils/nativeDialog";
import { blocksFromRichDoc, richDocFromPage } from "./blockConversion";
import { PageEditorSidebar } from "./PageEditorSidebar";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
import { useI18n } from "../../i18n/I18nProvider";
import { useGameStore } from "../../stores/gameStore";

const TipTapEditor = lazy(() =>
  import("./TipTapEditor").then((mod) => ({ default: mod.TipTapEditor })),
);

const AUTO_SAVE_DELAY_MS = 1200;

function pageSnapshot(title: string, richDoc: JSONContent): string {
  return JSON.stringify({ title, richDoc });
}

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

export function PageEditor() {
  const { t } = useI18n();
  const tree = useWorkspaceStore((state) => state.tree);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [translating, setTranslating] = useState(false);
  const viewportMode = useWorkspaceEditorViewport();
  const lastSavedSnapshotRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appLanguage = useGameStore((state) => state.settings.app_language) ?? "en";

  const folderPath = useMemo(() => {
    if (!selectedPage) {
      return "";
    }
    const names: string[] = [];
    let folderId: string | null | undefined = selectedPage.folder_id;
    const guard = new Set<string>();
    while (folderId && !guard.has(folderId)) {
      guard.add(folderId);
      const folder = tree.folders.find((item) => item.id === folderId);
      if (!folder) {
        break;
      }
      names.unshift(folder.name);
      folderId = folder.parent_id;
    }
    return names.join(" / ");
  }, [selectedPage, tree.folders]);

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
          void alertDialog(`Could not save page: ${message}`);
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
      <div className="ws-editor-root ws-editor-root--loading">
        <div className="ws-editor-loading">
          <span className="ws-editor-loading-spinner" aria-hidden="true" />
          Opening page…
        </div>
      </div>
    );
  }

  if (!selectedPage) {
    return (
      <div className="ws-editor-root ws-editor-root--empty">
        <WorkspaceEmptyState error={pageOpenError} />
      </div>
    );
  }

  const deletePage = async () => {
    const confirmed = await confirmDialog(
      t("workspace.deleteConfirm", { title: title || selectedPage.title }),
    );
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

  const translatePage = async (targetLanguage: string) => {
    if (!selectedPage || translating || saving) {
      return;
    }
    const confirmed = await confirmDialog(
      t("workspace.translateConfirm", {
        lang: t(`workspace.lang.${targetLanguage}`),
      }),
    );
    if (!confirmed) {
      return;
    }
    setTranslating(true);
    setSaveError(null);
    try {
      // Flush unsaved edits first so LLM sees current text.
      if (saveStatus === "unsaved") {
        await savePage(true);
      }
      const page = await invoke<WorkspacePage>("translate_workspace_page_cmd", {
        pageId: selectedPage.id,
        targetLanguage,
      });
      setSelectedPage(page);
      setTitle(page.title);
      const nextDoc = richDocFromPage(
        page.rich_doc as JSONContent | undefined,
        page.blocks,
      );
      setRichDoc(nextDoc);
      lastSavedSnapshotRef.current = pageSnapshot(page.title, nextDoc);
      setSaveStatus("saved");
      upsertPageSummary({
        id: page.id,
        title: page.title,
        folder_id: page.folder_id,
        last_edited_at: page.last_edited_at,
        last_edited_by: page.last_edited_by,
        sort_order: page.sort_order,
      });
      useGameStore
        .getState()
        .setStatusMessage(t("workspace.translateDone", { title: page.title }));
    } catch (error) {
      const message = String(error);
      setSaveError(message);
      void alertDialog(t("workspace.translateFailed", { error: message }));
    } finally {
      setTranslating(false);
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
      ? t("workspace.saving")
      : saveStatus === "unsaved"
        ? t("workspace.unsaved")
        : t("workspace.saved");

  return (
    <div
      className={`ws-editor-root${sidebarOpen ? "" : " ws-editor-root--sidebar-collapsed"}${viewportMode === "expanded" ? " ws-editor-root--viewport-expanded" : ""}`}
    >
      <div className="ws-editor-main">
        <header className="ws-editor-topbar">
          <div className="ws-editor-topbar-left">
            {folderPath ? <span className="ws-editor-breadcrumb">{folderPath}</span> : null}
            <span className={`ws-save-pill ws-save-pill--${saveStatus}`}>{saveLabel}</span>
            {saveError ? <span className="ws-save-error-inline">{saveError}</span> : null}
          </div>
          <div className="ws-editor-topbar-actions">
            {presence.length > 0 ? (
              <span className="ws-presence-pill">
                {t("workspace.viewing", { names: presence.map((entry) => entry.editor).join(", ") })}
              </span>
            ) : null}
            <button
              type="button"
              className="ws-topbar-btn"
              onClick={() => void savePage()}
              disabled={saving || translating || saveStatus === "saved"}
            >
              {t("workspace.save")}
            </button>
            <label className="ws-topbar-translate">
              <span className="ws-topbar-translate-label">
                {translating ? t("workspace.translating") : t("workspace.translate")}
              </span>
              <select
                className="ws-topbar-translate-select"
                disabled={saving || translating}
                value=""
                aria-label={t("workspace.translateAria")}
                onChange={(event) => {
                  const lang = event.target.value;
                  event.target.value = "";
                  if (lang) {
                    void translatePage(lang);
                  }
                }}
              >
                <option value="" disabled>
                  {t("workspace.translatePick")}
                </option>
                <option value="en">{t("workspace.lang.en")}</option>
                <option value="zh-Hant">{t("workspace.lang.zh-Hant")}</option>
                <option value="zh-Hans">{t("workspace.lang.zh-Hans")}</option>
                {appLanguage ? (
                  <option value={appLanguage}>
                    {t("workspace.translateCompanyDefault")} (
                    {t(`workspace.lang.${appLanguage}`)})
                  </option>
                ) : null}
              </select>
            </label>
            <button
              type="button"
              className="ws-topbar-btn ws-topbar-btn--danger"
              disabled={saving || translating}
              onClick={() => void deletePage()}
            >
              {t("workspace.delete")}
            </button>
            <button
              type="button"
              className="ws-topbar-btn ws-topbar-btn--ghost"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-pressed={sidebarOpen}
            >
              {sidebarOpen ? t("workspace.hidePanel") : t("workspace.showPanel")}
            </button>
          </div>
        </header>

        <div className="ws-editor-scroll">
          <article className="ws-editor-page">
            <input
              className="ws-page-title"
              value={title}
              placeholder={t("workspace.untitled")}
              onChange={(event) => setTitle(event.target.value)}
              aria-label={t("workspace.pageTitleAria")}
            />
            <div className="ws-page-meta">
              <span>v{selectedPage.version}</span>
              <span>·</span>
              <span>
                {t("workspace.editedBy", {
                  time: formatRelativeTime(selectedPage.last_edited_at),
                  who: selectedPage.last_edited_by,
                })}
              </span>
            </div>
            <Suspense
              fallback={
                <div className="ws-editor-loading">
                  <span className="ws-editor-loading-spinner" aria-hidden="true" />
                  {t("workspace.loadingEditor")}
                </div>
              }
            >
              <TipTapEditor
                placeholder={t("workspace.editor.placeholder")}
                value={richDoc}
                onChange={setRichDoc}
              />
            </Suspense>
          </article>
        </div>
      </div>

      {sidebarOpen ? (
        <PageEditorSidebar
          page={selectedPage}
          onPageUpdated={setSelectedPage}
          onOpenPage={(pageId) => void openPage(pageId)}
          onRestored={handleRestored}
        />
      ) : null}
    </div>
  );
}