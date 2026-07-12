import { useEffect, useMemo, useRef, useState } from "react";
import { isLlmLikeProgress, useProgressStore } from "../../stores/progressStore";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { useGameStore } from "../../stores/gameStore";
import { useI18n } from "../../i18n/I18nProvider";

function formatPercent(percent: number): string {
  if (percent < 0) {
    return "…";
  }
  return `${Math.round(percent)}%`;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function LoadingOverlay() {
  const { t } = useI18n();
  const current = useProgressStore((state) => state.current);
  const scene3dLabel = useProgressStore((state) => state.scene3dLabel);
  const clearProgress = useProgressStore((state) => state.clearProgress);
  const setLlmLiveOpen = useProgressStore((state) => state.setLlmLiveOpen);
  const llmLiveOpen = useProgressStore((state) => state.llmLiveOpen);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const liveBuffers = useAgentActivityStore((state) => state.liveBuffers);
  const activePanel = useGameStore((state) => state.activePanel);
  const activeMeeting = useGameStore((state) => state.activeMeeting);
  const streamEndRef = useRef<HTMLSpanElement | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.status === "active") ?? null,
    [sessions],
  );

  // Prefer active session buffer; else longest non-empty buffer (covers race / missed session_start).
  const { liveText, streamSession } = useMemo(() => {
    if (activeSession) {
      return {
        liveText: liveBuffers[activeSession.id] ?? "",
        streamSession: activeSession,
      };
    }
    let bestId: string | null = null;
    let bestLen = 0;
    for (const [id, text] of Object.entries(liveBuffers)) {
      if (text.length > bestLen) {
        bestLen = text.length;
        bestId = id;
      }
    }
    if (bestId && bestLen > 0) {
      const session = sessions.find((entry) => entry.id === bestId) ?? null;
      return { liveText: liveBuffers[bestId] ?? "", streamSession: session };
    }
    return { liveText: "", streamSession: null };
  }, [activeSession, liveBuffers, sessions]);

  const label = current?.label ?? scene3dLabel;
  const llmMode = Boolean(
    current && isLlmLikeProgress(current.operation_id, current.phase, current.label),
  );

  useEffect(() => {
    // Track age for any active progress (including meeting_close), not only llmMode.
    if (!current) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    if (llmMode) {
      setMinimized(false);
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [llmMode, current?.operation_id, current?.label, current?.phase]);

  // Auto-dismiss stale docks so meeting close / saving never sticks on other pages.
  useEffect(() => {
    if (!current) {
      return;
    }
    const op = current.operation_id ?? "";
    const labelLower = (current.label ?? "").toLowerCase();
    const phase = current.phase ?? "";
    const isMeetingOp =
      op.startsWith("meeting_")
      || phase === "llm"
      || phase === "meeting_close"
      || labelLower.includes("meeting");
    const closingLike =
      labelLower.includes("closing")
      || labelLower.includes("backlog")
      || labelLower.includes("saving")
      || labelLower.includes("applying")
      || labelLower.includes("recording")
      || labelLower.includes("waiting for app lock")
      || phase === "meeting_close"
      || phase === "done";

    // Closing / post-stream: drop quickly (user often navigates away).
    if (closingLike && elapsedSec >= 4) {
      clearProgress(current.operation_id);
      return;
    }
    // Absolute safety net for zombie LLM/meeting docks (e.g. hung finalize).
    if (isMeetingOp && elapsedSec >= 45) {
      clearProgress(current.operation_id);
    }
  }, [current, elapsedSec, clearProgress]);

  // Meeting finished → never keep LIVE dock on Projects/etc.
  useEffect(() => {
    if (!current) return;
    const op = current.operation_id ?? "";
    if (!op.startsWith("meeting_") && current.phase !== "llm" && current.phase !== "meeting_close") {
      return;
    }
    if (activeMeeting?.completed) {
      clearProgress(current.operation_id);
    }
  }, [activeMeeting?.completed, activeMeeting?.id, current, clearProgress]);

  useEffect(() => {
    if (!llmMode || !liveText) {
      return;
    }
    streamEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [llmMode, liveText]);

  if (!label) {
    return null;
  }

  const percent = current?.percent ?? -1;
  const indeterminate = percent < 0;
  const showBar = current !== null;
  const stuckHint =
    llmMode && elapsedSec >= 12 && !liveText
      ? t("llm.stuckHint")
      : null;

  // Closing progress is never a sticky LIVE dock on other pages.
  if (
    current
    && (current.phase === "meeting_close"
      || (current.label ?? "").toLowerCase().includes("closing meeting"))
  ) {
    if (activePanel !== "meeting" || elapsedSec >= 2) {
      return null;
    }
  }

  if (llmMode && current) {
    // Full multi-stream panel is open from footer — avoid stacking a second dock.
    if (llmLiveOpen) {
      return null;
    }
    // Meeting page already embeds LIVE STREAM — don't stack a second dock.
    if (activePanel === "meeting") {
      return null;
    }

    if (minimized) {
      return (
        <div className="loading-overlay loading-overlay--llm loading-overlay--llm-min" role="status">
          <button
            type="button"
            className="loading-overlay-min-chip"
            onClick={() => setMinimized(false)}
          >
            <span className="observatory-live-dot" aria-hidden="true" />
            LLM {formatElapsed(elapsedSec)}
            {liveText ? t("llm.minChars", { n: liveText.length }) : t("llm.minWaiting")}
          </button>
          <button
            type="button"
            className="loading-overlay-min-chip loading-overlay-min-chip--alt"
            onClick={() => setLlmLiveOpen(true)}
            title={t("llm.allLiveTitle")}
          >
            {t("llm.allLive")}
          </button>
        </div>
      );
    }

    const placeholder =
      elapsedSec < 3
        ? t("llm.connecting")
        : elapsedSec < 12
          ? t("llm.waitingToken")
          : t("llm.noTokensYet");

    return (
      <div
        className="loading-overlay loading-overlay--llm"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="loading-overlay-card loading-overlay-card--stream">
          <header className="loading-overlay-stream-header">
            <div className="loading-overlay-stream-title">
              <span className="observatory-live-pill">
                <span className="observatory-live-dot" aria-hidden="true" />
                {t("observatory.liveBadge")}
              </span>
              <p className="loading-overlay-label loading-overlay-label--stream">{label}</p>
              <span className="muted loading-overlay-elapsed">{formatElapsed(elapsedSec)}</span>
            </div>
            <div className="loading-overlay-stream-actions">
              <span className="muted loading-overlay-stream-meta">
                {streamSession
                  ? `${streamSession.agent_name}${streamSession.brain_label ? ` · ${streamSession.brain_label}` : ""}`
                  : liveText
                    ? t("llm.streaming")
                    : t("llm.startingSession")}
              </span>
              <button
                type="button"
                className="secondary-action loading-overlay-icon-btn"
                onClick={() => setLlmLiveOpen(true)}
                title={t("llm.allLiveTitle")}
              >
                {t("llm.allLive")}
              </button>
              <button
                type="button"
                className="secondary-action loading-overlay-icon-btn"
                onClick={() => setMinimized(true)}
              >
                {t("llm.minimize")}
              </button>
              <button
                type="button"
                className="secondary-action loading-overlay-icon-btn"
                onClick={() => clearProgress(current.operation_id)}
                title={t("llm.dismissTitle")}
              >
                {t("llm.dismiss")}
              </button>
            </div>
          </header>
          <pre className="loading-overlay-stream-text">
            {liveText || placeholder}
            <span className="observatory-cursor" ref={streamEndRef}>
              ▍
            </span>
          </pre>
          {stuckHint ? <p className="loading-overlay-stuck muted">{stuckHint}</p> : null}
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
