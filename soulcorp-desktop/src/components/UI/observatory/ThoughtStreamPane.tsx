import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../../../utils/tauriInvoke";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import type { ExecutionCliView, ExecutionRun, ExecutionWorkspaceInfo } from "../../../types/game";
import { EffectiveBrainPill } from "../brain/EffectiveBrainPill";
import { useI18n } from "../../../i18n/I18nProvider";
import { cleanDisplayTitle, CliInputModal } from "../execution/CliInputModal";
import type { AgentActivityEvent, AgentActivitySession } from "../../../types/agentActivity";

type StreamTab = "live" | "steps" | "terminal" | "output" | "reasoning";

interface ThoughtStreamPaneProps {
  session: AgentActivitySession | null;
  events: AgentActivityEvent[];
  compact?: boolean;
}

function transportForActivity(
  transport: string,
): "api" | "subprocess" | "builtin" | undefined {
  if (transport === "api" || transport === "mock") {
    return "api";
  }
  if (transport === "subprocess") {
    return "subprocess";
  }
  if (transport === "llm_only" || transport === "builtin") {
    return "builtin";
  }
  return undefined;
}

const TAB_I18N: Record<StreamTab, string> = {
  live: "stream.tab.live",
  steps: "stream.tab.steps",
  terminal: "stream.tab.terminal",
  output: "stream.tab.output",
  reasoning: "stream.tab.reasoning",
};

export function ThoughtStreamPane({ session, events, compact = false }: ThoughtStreamPaneProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<StreamTab>("live");
  const [cliPrompt, setCliPrompt] = useState<string | null>(null);
  const [cliCommand, setCliCommand] = useState<string | null>(null);
  const [cliPromptPath, setCliPromptPath] = useState<string | null>(null);
  const [cliWorkspace, setCliWorkspace] = useState<ExecutionWorkspaceInfo | null>(null);
  const [cliInputOpen, setCliInputOpen] = useState(false);
  const [cliInputLoading, setCliInputLoading] = useState(false);
  // Subscribe to the buffer string itself — selecting the getter function never re-renders on tokens.
  const liveText = useAgentActivityStore((state) =>
    session ? (state.liveBuffers[session.id] ?? "") : "",
  );
  const streamEndRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setCliPrompt(null);
    setCliCommand(null);
    setCliPromptPath(null);
    setCliWorkspace(null);
    setCliInputOpen(false);
  }, [session?.id, session?.run_id]);

  const openCliInput = async () => {
    if (!session?.run_id) {
      return;
    }
    // Always refetch so stale pre-fix command lines get rebuilt server-side.
    setCliInputLoading(true);
    try {
      const view = await invoke<ExecutionCliView>("get_execution_cli_input", {
        runId: session.run_id,
      });
      setCliCommand(view.command);
      setCliPrompt(view.prompt);
      setCliPromptPath(view.prompt_path ?? null);
      setCliWorkspace(view.workspace ?? null);
      setCliInputOpen(true);
    } catch {
      try {
        const run = await invoke<ExecutionRun>("get_execution_run", { runId: session.run_id });
        setCliCommand(run.cli_command ?? null);
        setCliPromptPath(run.cli_prompt_path ?? null);
        setCliWorkspace(run.workspace_info ?? null);
        setCliPrompt(
          run.cli_input?.trim()
            ? run.cli_input
            : t("observatory.cliLoadFailed"),
        );
        setCliInputOpen(true);
      } catch (error) {
        setCliCommand(null);
        setCliWorkspace(null);
        setCliPrompt(String(error));
        setCliInputOpen(true);
      }
    } finally {
      setCliInputLoading(false);
    }
  };

  const sessionEvents = useMemo(
    () =>
      session
        ? events.filter((event) => event.session_id === session.id)
        : [],
    [events, session],
  );

  useEffect(() => {
    if (tab !== "live" || !liveText) {
      return;
    }
    streamEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [tab, liveText]);

  const stepEvents = sessionEvents.filter(
    (event) => event.kind === "step_start" || event.kind === "step_complete",
  );
  const terminalLines = sessionEvents
    .filter((event) => event.kind === "terminal_line")
    .map((event) => event.content_delta ?? "");
  const reasoningText = sessionEvents
    .filter((event) => event.kind === "token_delta" && event.metadata?.reasoning === true)
    .map((event) => event.content_delta ?? "")
    .join("");
  const outputText =
    sessionEvents.find((event) => event.kind === "deliverable_ready")?.content_full ??
    sessionEvents.find((event) => event.kind === "step_complete" && event.step === "refine")
      ?.content_full ??
    sessionEvents.find((event) => event.kind === "step_complete" && event.step?.startsWith("turn_"))
      ?.content_full ??
    "";

  if (!session) {
    return (
      <div className={`observatory-stream-empty${compact ? " observatory-stream-empty--compact" : ""}`}>
        <p className="muted">{t("thought.pickAgent")}</p>
        <p className="muted">{t("thought.liveHint")}</p>
      </div>
    );
  }

  const tabs: StreamTab[] = ["live", "steps", "output"];
  if (terminalLines.length > 0) {
    tabs.splice(2, 0, "terminal");
  }
  if (reasoningText) {
    tabs.push("reasoning");
  }

  return (
    <div className={`observatory-stream-panel${compact ? " observatory-stream-panel--compact" : ""}`}>
      <header className="observatory-stream-meta">
        <div className="observatory-stream-meta-main">
          <div className="observatory-stream-meta-head">
            <strong>{session.agent_name}</strong>
            {session.status === "active" ? (
              <span className="observatory-live-pill">
                <span className="observatory-live-dot" aria-hidden="true" />
                {t("observatory.liveBadge")}
              </span>
            ) : (
              <span className="hub-pill tier">
                {t(`session.status.${session.status}`) === `session.status.${session.status}`
                  ? session.status
                  : t(`session.status.${session.status}`)}
              </span>
            )}
          </div>
          <p className="muted">
            {session.work_node_title ?? session.source}
            {session.started_at
              ? t("observatory.startedAt", {
                  time: new Date(session.started_at).toLocaleTimeString(),
                })
              : ""}
          </p>
          <div className="observatory-stream-actions">
            <EffectiveBrainPill
              label={session.brain_label}
              transport={transportForActivity(session.transport)}
            />
            {session.run_id ? (
              <button
                type="button"
                className="secondary-action observatory-cli-input-btn"
                disabled={cliInputLoading}
                onClick={() => void openCliInput()}
              >
                {cliInputLoading ? t("cli.loadingCli") : t("cli.viewCliInput")}
              </button>
            ) : null}
          </div>
        </div>
        <nav className="command-center-tabs observatory-stream-tabs" role="tablist" aria-label={t("observatory.streamTabsAria")}>
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={`command-center-tab${tab === item ? " is-active" : ""}`}
              onClick={() => setTab(item)}
            >
              {t(TAB_I18N[item])}
            </button>
          ))}
        </nav>
      </header>

      <div className="observatory-stream-body">
        {tab === "live" ? (
          <pre className="observatory-stream-text">
            {liveText ||
              (session.status === "active" ? t("stream.waitingTokens") : t("stream.noLiveText"))}
            {session.status === "active" ? (
              <span className="observatory-cursor" ref={streamEndRef}>
                ▍
              </span>
            ) : null}
          </pre>
        ) : null}
        {tab === "steps" ? (
          <ol className="observatory-step-list">
            {stepEvents.length === 0 ? (
              <li className="muted">{t("stream.noSteps")}</li>
            ) : (
              stepEvents.map((event) => (
                <li key={event.id} className={`observatory-step observatory-step--${event.kind}`}>
                  <strong>{event.step ?? event.kind}</strong>
                  {event.content_full ? <p>{event.content_full}</p> : null}
                </li>
              ))
            )}
          </ol>
        ) : null}
        {tab === "terminal" ? (
          <pre className="observatory-stream-text observatory-stream-text--terminal">
            {terminalLines.join("\n") || t("stream.noTerminal")}
          </pre>
        ) : null}
        {tab === "reasoning" ? (
          <pre className="observatory-stream-text">{reasoningText || t("stream.noReasoning")}</pre>
        ) : null}
        {tab === "output" ? (
          <pre className="observatory-stream-text">{outputText || t("stream.noOutput")}</pre>
        ) : null}
      </div>
      {cliInputOpen && cliPrompt != null ? (
        <CliInputModal
          title={t("cli.titleWithTask", {
            task: cleanDisplayTitle(session.work_node_title ?? session.agent_name),
          })}
          command={cliCommand}
          prompt={cliPrompt}
          promptPath={cliPromptPath}
          workspace={cliWorkspace}
          onClose={() => setCliInputOpen(false)}
        />
      ) : null}
    </div>
  );
}