import { useEffect, useRef, useState } from "react";
import {
  loadWorkspaceSidebarWidth,
  saveWorkspaceSidebarWidth,
} from "../services/workspaceClient";

const MIN_WIDTH = 220;
const ABSOLUTE_MAX_WIDTH = 480;

export function useWorkspaceSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState(loadWorkspaceSidebarWidth);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return;
      }
      const delta = event.clientX - startXRef.current;
      const shell = document.querySelector(".workspace-shell");
      const shellWidth = shell?.getBoundingClientRect().width ?? 960;
      const maxWidth = Math.min(ABSOLUTE_MAX_WIDTH, Math.floor(shellWidth * 0.52));
      const nextWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      document.body.classList.remove("workspace-resizing");
      setSidebarWidth((width) => {
        saveWorkspaceSidebarWidth(width);
        return width;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startXRef.current = event.clientX;
    startWidthRef.current = sidebarWidth;
    document.body.classList.add("workspace-resizing");
  };

  return { sidebarWidth, startResize };
}