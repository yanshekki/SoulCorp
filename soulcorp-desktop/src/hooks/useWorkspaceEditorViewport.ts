import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

export type WorkspaceEditorViewportMode = "normal" | "expanded";

async function isViewportExpanded(): Promise<boolean> {
  if (document.fullscreenElement) {
    return true;
  }
  if (window.matchMedia("(display-mode: fullscreen)").matches) {
    return true;
  }
  try {
    const appWindow = getCurrentWindow();
    return (await appWindow.isFullscreen()) || (await appWindow.isMaximized());
  } catch {
    return window.innerWidth >= 1600;
  }
}

export function useWorkspaceEditorViewport(): WorkspaceEditorViewportMode {
  const [mode, setMode] = useState<WorkspaceEditorViewportMode>("normal");

  useEffect(() => {
    let disposed = false;

    const refresh = () => {
      void isViewportExpanded().then((expanded) => {
        if (!disposed) {
          setMode(expanded ? "expanded" : "normal");
        }
      });
    };

    refresh();
    window.addEventListener("resize", refresh);
    document.addEventListener("fullscreenchange", refresh);

    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onResized(refresh)
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      window.removeEventListener("resize", refresh);
      document.removeEventListener("fullscreenchange", refresh);
      unlisten?.();
    };
  }, []);

  return mode;
}