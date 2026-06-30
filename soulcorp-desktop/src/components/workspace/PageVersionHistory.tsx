import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { PageVersionSummary, WorkspacePage } from "../../types/workspace";

interface PageVersionHistoryProps {
  pageId: string;
  onRestored: (page: WorkspacePage) => void;
}

export function PageVersionHistory({ pageId, onRestored }: PageVersionHistoryProps) {
  const [versions, setVersions] = useState<PageVersionSummary[]>([]);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    void invoke<PageVersionSummary[]>("list_page_versions", { page_id: pageId })
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [pageId]);

  const restore = async (version: number) => {
    setRestoring(version);
    try {
      const page = await invoke<WorkspacePage>("restore_page_version", {
        request: { page_id: pageId, version },
      });
      onRestored(page);
      const next = await invoke<PageVersionSummary[]>("list_page_versions", { page_id: pageId });
      setVersions(next);
    } finally {
      setRestoring(null);
    }
  };

  if (versions.length === 0) {
    return null;
  }

  return (
    <section className="page-version-history">
      <h3>Version history</h3>
      <ul>
        {versions.map((entry) => (
          <li key={entry.version}>
            <div>
              <strong>v{entry.version}</strong> · {entry.editor} · {entry.title}
              <span className="muted"> — {new Date(entry.saved_at).toLocaleString()}</span>
            </div>
            <button
              type="button"
              className="tiny-btn"
              disabled={restoring === entry.version}
              onClick={() => void restore(entry.version)}
            >
              {restoring === entry.version ? "Restoring..." : "Restore"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}