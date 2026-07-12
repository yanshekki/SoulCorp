import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { WORKSPACE_NAV_VIEWS, type WorkspaceNavView } from "../../types/workspaceNav";
import { buildAllListItems } from "../../utils/workspaceListItems";
import { useI18n } from "../../i18n/I18nProvider";

interface WorkspaceCommandPaletteProps {
  onNewPage: () => void;
  onUpload: () => void;
}

type PaletteEntry =
  | { kind: "item"; id: string; label: string; meta: string; icon: string }
  | { kind: "action"; id: string; label: string; meta: string; icon: string; run: () => void }
  | { kind: "view"; id: WorkspaceNavView; label: string; meta: string; icon: string };

export function WorkspaceCommandPalette({
  onNewPage,
  onUpload,
}: WorkspaceCommandPaletteProps) {
  const { t } = useI18n();
  const open = useWorkspaceStore((state) => state.commandPaletteOpen);
  const setCommandPaletteOpen = useWorkspaceStore((state) => state.setCommandPaletteOpen);
  const tree = useWorkspaceStore((state) => state.tree);
  const pinnedIds = useWorkspaceStore((state) => state.pinnedIds);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);
  const openWorkspaceItem = useWorkspaceStore((state) => state.openWorkspaceItem);
  const loadSummaries = useWorkspaceStore((state) => state.loadSummaries);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<PaletteEntry[]>(() => {
    const items = buildAllListItems(tree, new Set(pinnedIds)).map(
      (item): PaletteEntry => ({
        kind: "item",
        id: item.id,
        label: item.title,
        meta: item.folderLabel,
        icon: item.icon,
      }),
    );
    const actions: PaletteEntry[] = [
      {
        kind: "action",
        id: "new-page",
        label: t("workspace.palette.newPage"),
        meta: t("workspace.palette.newPageMeta"),
        icon: "＋",
        run: onNewPage,
      },
      {
        kind: "action",
        id: "upload",
        label: t("workspace.palette.upload"),
        meta: t("workspace.palette.uploadMeta"),
        icon: "⬆",
        run: onUpload,
      },
    ];
    const views: PaletteEntry[] = WORKSPACE_NAV_VIEWS.map(
      (view): PaletteEntry => ({
        kind: "view",
        id: view.id,
        label: t("workspace.palette.switchTo", { view: t(`workspace.view.${view.id}`) }),
        meta: t("workspace.palette.navView"),
        icon: view.icon,
      }),
    );
    return [...actions, ...views, ...items];
  }, [tree, pinnedIds, onNewPage, onUpload, t]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return entries.slice(0, 40);
    }
    return entries
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(needle) ||
          entry.meta.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [entries, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightIndex(0);
      return;
    }
    void loadSummaries();
    inputRef.current?.focus();
  }, [open, loadSummaries]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  const runEntry = (entry: PaletteEntry) => {
    if (entry.kind === "item") {
      void openWorkspaceItem(entry.id);
    } else if (entry.kind === "view") {
      setActiveView(entry.id);
    } else {
      entry.run();
    }
    setCommandPaletteOpen(false);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="ws-command-overlay" onClick={() => setCommandPaletteOpen(false)}>
      <div
        className="ws-command-palette"
        role="dialog"
        aria-label={t("workspace.paletteAria")}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="ws-command-input"
          value={query}
          placeholder={t("workspace.palettePlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightIndex((index) => Math.min(index + 1, filtered.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && filtered[highlightIndex]) {
              event.preventDefault();
              runEntry(filtered[highlightIndex]);
            } else if (event.key === "Escape") {
              setCommandPaletteOpen(false);
            }
          }}
        />
        <div className="ws-command-results">
          {filtered.length === 0 ? (
            <p className="ws-command-empty muted">{t("common.noMatches")}</p>
          ) : (
            filtered.map((entry, index) => (
              <button
                key={`${entry.kind}-${entry.id}`}
                type="button"
                className={`ws-command-result${index === highlightIndex ? " active" : ""}`}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => runEntry(entry)}
              >
                <span className="ws-command-result-icon" aria-hidden="true">
                  {entry.icon}
                </span>
                <span className="ws-command-result-body">
                  <strong>{entry.label}</strong>
                  <span>{entry.meta}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <footer className="ws-command-footer muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </footer>
      </div>
    </div>
  );
}