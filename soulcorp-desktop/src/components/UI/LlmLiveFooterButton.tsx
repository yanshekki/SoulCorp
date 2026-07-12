import { useMemo } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import {
  isLlmLikeProgress,
  useProgressStore,
} from "../../stores/progressStore";

/**
 * Status-bar control: always available, opens the LLM Live panel.
 */
export function LlmLiveFooterButton() {
  const { t } = useI18n();
  const open = useProgressStore((state) => state.llmLiveOpen);
  const setOpen = useProgressStore((state) => state.setLlmLiveOpen);
  const operations = useProgressStore((state) => state.operations);
  const recent = useProgressStore((state) => state.recent);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const liveBuffers = useAgentActivityStore((state) => state.liveBuffers);

  const activeAgents = useMemo(
    () => sessions.filter((session) => session.status === "active").length,
    [sessions],
  );

  const liveOps = useMemo(
    () =>
      Object.values(operations).filter((op) =>
        isLlmLikeProgress(op.operation_id, op.phase, op.label),
      ).length,
    [operations],
  );

  const recentCount = useMemo(
    () =>
      recent.filter((op) =>
        isLlmLikeProgress(op.operation_id, op.phase, op.label, { includeFinished: true }),
      ).length,
    [recent],
  );

  const streamingChars = useMemo(() => {
    let total = 0;
    for (const session of sessions) {
      if (session.status === "active") {
        total += liveBuffers[session.id]?.length ?? 0;
      }
    }
    return total;
  }, [sessions, liveBuffers]);

  const liveCount = activeAgents + liveOps;
  const hasLive = liveCount > 0 || recentCount > 0;
  const badge = liveCount > 0 ? liveCount : recentCount > 0 ? recentCount : 0;

  return (
    <button
      type="button"
      className={`llm-live-footer-btn${hasLive ? " is-live" : ""}${open ? " is-open" : ""}`}
      onClick={() => setOpen(!open)}
      title={t("llmLive.footerTitle")}
      aria-pressed={open}
    >
      {hasLive ? (
        <span className="observatory-live-dot" aria-hidden="true" />
      ) : (
        <span className="llm-live-footer-dot-idle" aria-hidden="true" />
      )}
      <span>{t("llmLive.title")}</span>
      {hasLive ? (
        <span className="llm-live-footer-count">
          {badge}
          {liveCount > 0 && streamingChars > 0
            ? ` · ${streamingChars.toLocaleString()}c`
            : liveCount === 0 && recentCount > 0
              ? t("llmLive.footerRecent")
              : ""}
        </span>
      ) : null}
    </button>
  );
}
