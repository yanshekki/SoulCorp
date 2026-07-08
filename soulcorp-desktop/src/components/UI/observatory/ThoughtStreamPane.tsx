import { useMemo, useState } from "react";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import { EffectiveBrainPill } from "../brain/EffectiveBrainPill";
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

const TAB_LABELS: Record<StreamTab, string> = {
  live: "Live",
  steps: "Steps",
  terminal: "Terminal",
  output: "Output",
  reasoning: "Reasoning",
};

export function ThoughtStreamPane({ session, events, compact = false }: ThoughtStreamPaneProps) {
  const [tab, setTab] = useState<StreamTab>("live");
  const liveTextForSession = useAgentActivityStore((state) => state.liveTextForSession);

  const sessionEvents = useMemo(
    () =>
      session
        ? events.filter((event) => event.session_id === session.id)
        : [],
    [events, session],
  );

  const liveText = session ? liveTextForSession(session.id) : "";
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
        <p className="muted">Pick a live agent above or a history event to load the mind stream.</p>
        <p className="muted">
          Live tab shows token-by-token output. Steps, terminal, and output appear when the session
          produces them.
        </p>
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
                LIVE
              </span>
            ) : (
              <span className="hub-pill tier">{session.status}</span>
            )}
          </div>
          <p className="muted">
            {session.work_node_title ?? session.source}
            {session.started_at ? ` · started ${new Date(session.started_at).toLocaleTimeString()}` : ""}
          </p>
          <EffectiveBrainPill
            label={session.brain_label}
            transport={transportForActivity(session.transport)}
          />
        </div>
        <nav className="command-center-tabs observatory-stream-tabs" role="tablist" aria-label="Mind stream views">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={`command-center-tab${tab === item ? " is-active" : ""}`}
              onClick={() => setTab(item)}
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </nav>
      </header>

      <div className="observatory-stream-body">
        {tab === "live" ? (
          <pre className="observatory-stream-text">
            {liveText || (session.status === "active" ? "Waiting for tokens…" : "No live text captured.")}
            {session.status === "active" ? <span className="observatory-cursor">▍</span> : null}
          </pre>
        ) : null}
        {tab === "steps" ? (
          <ol className="observatory-step-list">
            {stepEvents.length === 0 ? (
              <li className="muted">No step trace yet.</li>
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
            {terminalLines.join("\n") || "No terminal output."}
          </pre>
        ) : null}
        {tab === "reasoning" ? (
          <pre className="observatory-stream-text">{reasoningText || "No reasoning stream."}</pre>
        ) : null}
        {tab === "output" ? (
          <pre className="observatory-stream-text">{outputText || "No final output yet."}</pre>
        ) : null}
      </div>
    </div>
  );
}