import { useProgressStore } from "../../stores/progressStore";

function formatPercent(percent: number): string {
  if (percent < 0) {
    return "…";
  }
  return `${Math.round(percent)}%`;
}

export function LoadingOverlay() {
  const current = useProgressStore((state) => state.current);
  const scene3dLabel = useProgressStore((state) => state.scene3dLabel);

  const label = current?.label ?? scene3dLabel;
  if (!label) {
    return null;
  }

  const percent = current?.percent ?? -1;
  const indeterminate = percent < 0;
  const showBar = current !== null;

  return (
    <div
      className={`loading-overlay${showBar ? "" : " loading-overlay--scene"}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-overlay-card">
        <div className="loading-overlay-spinner" aria-hidden="true" />
        <p className="loading-overlay-label">{label}</p>
        {showBar ? (
          <div className="loading-overlay-progress">
            <div
              className={`progress-bar${indeterminate ? " progress-bar--indeterminate" : ""}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={indeterminate ? undefined : Math.round(percent)}
              aria-label={label}
            >
              {!indeterminate ? (
                <span
                  className="progress-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
              ) : (
                <span className="progress-bar-fill progress-bar-fill--indeterminate" />
              )}
            </div>
            <span className="loading-overlay-percent">{formatPercent(percent)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}