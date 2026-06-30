import { useCallback, useEffect, useRef, useState } from "react";
import { useContainerSize } from "../hooks/useContainerSize";
import { is3dSmokeTestEnabled, submit3dSmokeFailure } from "../services/scene3dSmoke";
import { useGameStore } from "../stores/gameStore";
import { OfficeMapFallback } from "./world/OfficeMapFallback";
import {
  ThreeOfficeRenderer,
  type RenderStatus,
} from "./world/ThreeOfficeRenderer";
import { probeWebGL } from "./world/webglDiagnostics";

type SceneMode = "3d" | "fallback";

export function GameScene() {
  const containerRef = useRef<HTMLElement>(null);
  const size = useContainerSize(containerRef);
  const pixelFilter = useGameStore((state) => state.settings.pixel_filter_enabled);
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("initializing");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [forcedFallback, setForcedFallback] = useState(false);

  const ready = size.width > 80 && size.height > 80;
  const webglProbe = ready ? probeWebGL() : null;
  const webglBlocked = webglProbe !== null && !webglProbe.ok;

  const mode: SceneMode =
    forcedFallback || lowPowerMode || webglBlocked || renderStatus === "failed"
      ? "fallback"
      : "3d";

  const handleStatusChange = useCallback((status: RenderStatus, error?: string) => {
    setRenderStatus(status);
    setRenderError(error ?? null);
  }, []);

  const errorMessage =
    renderError ??
    (webglProbe && !webglProbe.ok ? webglProbe.reason : null) ??
    "3D renderer failed to start.";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await is3dSmokeTestEnabled())) {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 20_000));
      if (cancelled || renderStatus === "ready") {
        return;
      }
      await submit3dSmokeFailure({
        renderStatus,
        mode,
        error: errorMessage,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [errorMessage, mode, renderStatus]);

  const handleRetry3d = () => {
    setForcedFallback(false);
    setRenderError(null);
    setRenderStatus("initializing");
    setRetryKey((value) => value + 1);
  };

  const showError =
    renderStatus === "failed" ||
    webglBlocked ||
    (renderStatus === "initializing" && ready && mode === "fallback" && !lowPowerMode);

  return (
    <section
      ref={containerRef}
      className={`game-scene ${pixelFilter ? "pixel-filter" : ""}`}
      aria-label="Isometric office world"
    >
      <div className="game-scene-sky" aria-hidden />
      {!ready ? (
        <OfficeMapFallback />
      ) : mode === "3d" ? (
        <ThreeOfficeRenderer
          key={retryKey}
          width={size.width}
          height={size.height}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <OfficeMapFallback />
      )}

      {showError && errorMessage ? (
        <div className="scene-render-error" role="alert">
          <strong>3D view unavailable</strong>
          <p>{errorMessage}</p>
          <div className="scene-render-error-actions">
            <button type="button" onClick={handleRetry3d}>
              Retry 3D
            </button>
            <button type="button" onClick={() => setForcedFallback(true)}>
              Use map view
            </button>
          </div>
        </div>
      ) : null}

      <div className="scene-hint">
        {mode === "3d"
          ? "3D office campus — click buildings to inspect departments."
          : "Map view — click buildings to inspect departments."}
        {renderStatus === "ready" && mode === "3d" ? (
          <span className="scene-hint-badge">WebGL</span>
        ) : null}
      </div>
    </section>
  );
}