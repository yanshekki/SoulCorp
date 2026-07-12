import { useEffect, useMemo, useRef } from "react";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import {
  isLlmLikeProgress,
  useProgressStore,
} from "../../stores/progressStore";
import { useI18n } from "../../i18n/I18nProvider";
import { useGameStore } from "../../stores/gameStore";

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Footer-opened panel: all concurrent LLM / agent live streams + progress ops.
 */
export function LlmLivePanel() {
  const { t } = useI18n();
  const open = useProgressStore((state) => state.llmLiveOpen);
  const setOpen = useProgressStore((state) => state.setLlmLiveOpen);
  const operations = useProgressStore((state) => state.operations);
  const recent = useProgressStore((state) => state.recent);
  const clearProgress = useProgressStore((state) => state.clearProgress);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const liveBuffers = useAgentActivityStore((state) => state.liveBuffers);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === "active"),
    [sessions],
  );

  const liveOps = useMemo(
    () =>
      Object.values(operations).filter((op) =>
        isLlmLikeProgress(op.operation_id, op.phase, op.label, { includeFinished: true }),
      ),
    [operations],
  );

  const recentOps = useMemo(
    () =>
      recent.filter((op) =>
        isLlmLikeProgress(op.operation_id, op.phase, op.label, { includeFinished: true }),
      ),
    [recent],
  );

  // Sessions that have buffer text even if marked completed recently
  const bufferedSessions = useMemo(() => {
    const activeIds = new Set(activeSessions.map((s) => s.id));
    const extras = sessions.filter(
      (session) =>
        !activeIds.has(session.id) &&
        (liveBuffers[session.id]?.length ?? 0) > 0 &&
        session.status !== "failed",
    );
    // Prefer active first, then recent buffers
    return [...activeSessions, ...extras.slice(-6)];
  }, [activeSessions, sessions, liveBuffers]);

  useEffect(() => {
    if (!open) return;
    streamEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, liveBuffers, bufferedSessions.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) {
    return null;
  }

  const empty =
    liveOps.length === 0 && recentOps.length === 0 && bufferedSessions.length === 0;

  return (
    <div
      className="llm-live-panel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="llm-live-panel-title"
      onClick={() => setOpen(false)}
    >
      <div
        className="llm-live-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="llm-live-panel-header">
          <div>
            <p className="llm-live-panel-eyebrow">
              <span className="observatory-live-dot" aria-hidden="true" />
              {t("llmLive.title")}
            </p>
            <h2 id="llm-live-panel-title">{t("llmLive.heading")}</h2>
            <p className="muted">{t("llmLive.subtitle")}</p>
          </div>
          <div className="llm-live-panel-header-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setOpen(false);
                setActivePanel("observatory");
              }}
            >
              {t("llmLive.openObservatory")}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
            >
              {t("common.close")}
            </button>
          </div>
        </header>

        <div className="llm-live-panel-body">
          {liveOps.length > 0 || recentOps.length > 0 ? (
            <section className="llm-live-section">
              <h3>
                Operations ({liveOps.length}
                {recentOps.length > 0 ? ` · ${recentOps.length} recent` : ""})
              </h3>
              <ul className="llm-live-op-list">
                {liveOps.map((op) => {
                  const elapsed = formatElapsed(Date.now() - (op.startedAt ?? Date.now()));
                  const pct = op.percent;
                  return (
                    <li key={op.operation_id} className="llm-live-op-card">
                      <div className="llm-live-op-row">
                        <span className="observatory-live-pill">
                          <span className="observatory-live-dot" aria-hidden="true" />
                          LIVE
                        </span>
                        <strong>{op.label || op.operation_id}</strong>
                        <span className="muted">{elapsed}</span>
                        <button
                          type="button"
                          className="tiny-btn"
                          onClick={() => clearProgress(op.operation_id)}
                        >
                          {t("llm.dismiss")}
                        </button>
                      </div>
                      <p className="muted llm-live-op-meta">
                        {op.operation_id}
                        {op.phase ? ` · ${op.phase}` : ""}
                        {pct >= 0 ? ` · ${Math.round(pct)}%` : " · …"}
                      </p>
                      {pct >= 0 ? (
                        <div className="progress-bar" aria-hidden="true">
                          <span
                            className="progress-bar-fill"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                      ) : (
                        <div
                          className="progress-bar progress-bar--indeterminate"
                          aria-hidden="true"
                        >
                          <span className="progress-bar-fill progress-bar-fill--indeterminate" />
                        </div>
                      )}
                    </li>
                  );
                })}
                {recentOps.map((op) => (
                  <li key={`recent-${op.operation_id}-${op.finishedAt}`} className="llm-live-op-card is-recent">
                    <div className="llm-live-op-row">
                      <span className={`llm-live-status-pill is-${op.status}`}>
                        {op.status === "error" ? "ERROR" : "DONE"}
                      </span>
                      <strong>{op.label || op.operation_id}</strong>
                      <span className="muted">{t("llmLive.ago", { time: formatElapsed(Date.now() - op.finishedAt) })}</span>
                    </div>
                    <p className="muted llm-live-op-meta">{op.operation_id}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="llm-live-section">
            <h3>
              {t("llmLive.streamsTitle", {
                n: bufferedSessions.length,
                active:
                  activeSessions.length > 0
                    ? t("llmLive.activeCount", { n: activeSessions.length })
                    : "",
              })}
            </h3>
            {bufferedSessions.length === 0 ? (
              <p className="muted">
                {empty ? t("llmLive.emptyIdle") : t("llmLive.emptyNone")}
              </p>
            ) : (
              <div className="llm-live-stream-grid">
                {bufferedSessions.map((session) => {
                  const text = liveBuffers[session.id] ?? "";
                  const active = session.status === "active";
                  return (
                    <article
                      key={session.id}
                      className={`llm-live-stream-card${active ? " is-active" : ""}`}
                    >
                      <header className="llm-live-stream-card-header">
                        {active ? (
                          <span className="observatory-live-pill">
                            <span className="observatory-live-dot" aria-hidden="true" />
                            {t("observatory.liveBadge")}
                          </span>
                        ) : (
                          <span className="muted">
                            {t(`session.status.${session.status}`) ===
                            `session.status.${session.status}`
                              ? session.status
                              : t(`session.status.${session.status}`)}
                          </span>
                        )}
                        <strong>{session.agent_name}</strong>
                        <span className="muted">
                          {session.brain_label || session.source || "agent"}
                        </span>
                      </header>
                      <pre className="llm-live-stream-text">
                        {text ||
                          (active
                            ? t("llmLive.waitingToken")
                            : t("llmLive.noStream"))}
                        {active ? (
                          <span className="observatory-cursor" ref={streamEndRef}>
                            ▍
                          </span>
                        ) : null}
                      </pre>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
