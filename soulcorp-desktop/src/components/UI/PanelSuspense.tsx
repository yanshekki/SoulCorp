export function PanelSuspense() {
  return (
    <div className="app-stage-transition panel-suspense" role="status" aria-live="polite">
      <div className="panel-suspense-inner">
        <span className="panel-suspense-spinner" aria-hidden="true" />
        <p className="muted">Loading…</p>
      </div>
    </div>
  );
}