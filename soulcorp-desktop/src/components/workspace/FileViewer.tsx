import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  deleteWorkspaceFile,
  getWorkspaceFile,
  getWorkspaceFilePath,
  listWorkspaceTree,
  openWorkspaceFileExternally,
} from "../../services/workspaceClient";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import type { WorkspaceFilePathResponse } from "../../types/workspace";
import { fileKindIcon, formatFileSize } from "../../utils/workspaceFileTypes";

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function FileViewer() {
  const tree = useWorkspaceStore((state) => state.tree);
  const selectedFile = useWorkspaceStore((state) => state.selectedFile);
  const openingFileId = useWorkspaceStore((state) => state.openingFileId);
  const fileOpenError = useWorkspaceStore((state) => state.fileOpenError);
  const setSelectedFile = useWorkspaceStore((state) => state.setSelectedFile);
  const removeFileSummary = useWorkspaceStore((state) => state.removeFileSummary);
  const setTree = useWorkspaceStore((state) => state.setTree);
  const [pathInfo, setPathInfo] = useState<WorkspaceFilePathResponse | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const folderPath = selectedFile
    ? (() => {
        const names: string[] = [];
        let folderId: string | null | undefined = selectedFile.folder_id;
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
      })()
    : "";

  useEffect(() => {
    if (!selectedFile) {
      setPathInfo(null);
      setTextPreview(null);
      return;
    }

    let cancelled = false;
    void getWorkspaceFilePath(selectedFile.id)
      .then((response) => {
        if (!cancelled) {
          setPathInfo(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPathInfo(null);
        }
      });

    if (selectedFile.file_kind === "text" && selectedFile.size_bytes <= 512_000) {
      void getWorkspaceFile(selectedFile.id)
        .then(async () => {
          const response = await getWorkspaceFilePath(selectedFile.id);
          const assetUrl = convertFileSrc(response.absolute_path);
          const res = await fetch(assetUrl);
          const text = await res.text();
          if (!cancelled) {
            setTextPreview(text.slice(0, 20_000));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTextPreview(null);
          }
        });
    } else {
      setTextPreview(null);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  if (openingFileId && !selectedFile) {
    return (
      <div className="ws-editor-root ws-editor-root--loading">
        <div className="ws-editor-loading">
          <span className="ws-editor-loading-spinner" aria-hidden="true" />
          Opening file…
        </div>
      </div>
    );
  }

  if (!selectedFile) {
    return null;
  }

  const previewUrl = pathInfo ? convertFileSrc(pathInfo.absolute_path) : null;

  const deleteFile = async () => {
    const confirmed = window.confirm(`Delete "${selectedFile.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteWorkspaceFile(selectedFile.id);
      removeFileSummary(selectedFile.id);
      setSelectedFile(null);
      const refreshed = await listWorkspaceTree();
      setTree(refreshed);
    } finally {
      setBusy(false);
    }
  };

  const openExternal = async () => {
    setBusy(true);
    try {
      await openWorkspaceFileExternally(selectedFile.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ws-editor-root ws-file-viewer-root">
      <div className="ws-editor-main">
        <header className="ws-editor-topbar">
          <div className="ws-editor-topbar-left">
            {folderPath ? <span className="ws-editor-breadcrumb">{folderPath}</span> : null}
            <span className="ws-save-pill ws-save-pill--saved">File</span>
            {fileOpenError ? <span className="ws-save-error-inline">{fileOpenError}</span> : null}
          </div>
          <div className="ws-editor-topbar-actions">
            <button type="button" className="ws-topbar-btn" disabled={busy} onClick={() => void openExternal()}>
              Open externally
            </button>
            <button
              type="button"
              className="ws-topbar-btn ws-topbar-btn--danger"
              disabled={busy}
              onClick={() => void deleteFile()}
            >
              Delete
            </button>
          </div>
        </header>

        <div className="ws-editor-scroll">
          <article className="ws-editor-page ws-file-viewer-page">
            <div className="ws-file-hero">
              <span className="ws-file-hero-icon" aria-hidden="true">
                {fileKindIcon(selectedFile.file_kind)}
              </span>
              <div>
                <h1 className="ws-file-title">{selectedFile.name}</h1>
                <p className="ws-file-meta">
                  {selectedFile.extension.toUpperCase()} · {formatFileSize(selectedFile.size_bytes)} ·{" "}
                  uploaded {formatRelativeTime(selectedFile.uploaded_at)} by {selectedFile.uploaded_by}
                </p>
              </div>
            </div>

            {selectedFile.file_kind === "image" && previewUrl ? (
              <div className="ws-file-preview ws-file-preview--image">
                <img src={previewUrl} alt={selectedFile.name} />
              </div>
            ) : null}

            {selectedFile.file_kind === "pdf" && previewUrl ? (
              <div className="ws-file-preview ws-file-preview--pdf">
                <iframe title={selectedFile.name} src={previewUrl} />
              </div>
            ) : null}

            {selectedFile.file_kind === "video" && previewUrl ? (
              <div className="ws-file-preview ws-file-preview--video">
                <video controls src={previewUrl} />
              </div>
            ) : null}

            {selectedFile.file_kind === "audio" && previewUrl ? (
              <div className="ws-file-preview ws-file-preview--audio">
                <audio controls src={previewUrl} />
              </div>
            ) : null}

            {textPreview ? (
              <pre className="ws-file-preview ws-file-preview--text">{textPreview}</pre>
            ) : null}

            {!previewUrl && !textPreview ? (
              <div className="ws-file-preview ws-file-preview--generic">
                <p>
                  Preview is not available for this file type in-app. Use <strong>Open externally</strong> to
                  view it with your system app.
                </p>
              </div>
            ) : null}
          </article>
        </div>
      </div>
    </div>
  );
}