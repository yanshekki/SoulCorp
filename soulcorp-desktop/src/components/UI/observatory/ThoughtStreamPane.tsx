import { useMemo, useState } from "react";
import { useAgentActivityStore } from "../../../stores/agentActivityStore";
import type { AgentActivityEvent, AgentActivitySession } from "../../../types/agentActivity";

type StreamTab = "live" | "steps" | "terminal" | "output" | "reasoning";

interface ThoughtStreamPaneProps {
  session: AgentActivitySession | null;
  events: AgentActivityEvent[];
  compact?: boolean;
}

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
      <section className={`observatory-stream ${compact ? "observatory-stream--compact" : ""}`}>
        <p className="muted">Select an agent or timeline event to view the thought stream.</p>
      </section>
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
    <section className={`observatory-stream ${compact ? "observatory-stream--compact" : ""}`}>
      <header className="observatory-stream-header">
        <div>
          <h3>{session.agent_name}</h3>
          <p className="muted">
            {session.brain_label} · {session.transport}
            {session.work_node_title ? ` · ${session.work_node_title}` : ""}
          </p>
        </div>
        <div className="observatory-stream-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? "is-active" : undefined}
              onClick={() => setTab(item)}
            >
              {item === "live"
                ? "Live"
                : item === "steps"
                  ? "Steps"
                  : item === "terminal"
                    ? "Terminal"
                    : item === "reasoning"
                      ? "Reasoning"
                      : "Output"}
            </button>
          ))}
        </div>
      </header>

      <div className="observatory-stream-body">
        {tab === "live" ? (
          <pre className="observatory-stream-text">
            {liveText || "Waiting for tokens…"}
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
    </section>
  );
}