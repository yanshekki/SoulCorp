import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import { filterByQuery } from "../../utils/listSearch";
import { SearchableListToolbar } from "./SearchableListToolbar";
import { openWorkspacePage } from "../../utils/openWorkspacePage";
import { clearLocalProgress, reportLocalProgress } from "../../stores/progressStore";
import { resolveEffectiveAiProviderLabel } from "../../data/aiProviders";
import { formatAgentOptionLabel } from "../../utils/agentLabel";
import type {
  CompanyDepartmentsSnapshot,
  MeetingAiStatus,
  MeetingSnapshot,
  MeetingTurnCostEstimate,
} from "../../types/game";

const MEETING_TYPES = [
  "Daily Standup",
  "Project Kickoff",
  "Crisis Meeting",
  "Team Building",
  "Strategy Discussion",
];

export const MEETING_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "session", label: "Session" },
  { id: "transcript", label: "Transcript" },
] as const;

interface MeetingPanelProps {
  onSectionFocus?: (sectionId: string) => void;
}

function MeetingCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="meeting-card"
      data-meeting-section={id}
    >
      <header className="meeting-card-header">
        <h3>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
      </header>
      <div className="meeting-card-body">{children}</div>
    </section>
  );
}

export function MeetingPanel({ onSectionFocus }: MeetingPanelProps) {
  const settings = useGameStore((state) => state.settings);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const activeMeeting = useGameStore((state) => state.activeMeeting);
  const setActiveMeeting = useGameStore((state) => state.setActiveMeeting);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [meetingType, setMeetingType] = useState(MEETING_TYPES[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [aiStatus, setAiStatus] = useState<MeetingAiStatus | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [turnCost, setTurnCost] = useState<MeetingTurnCostEstimate | null>(null);
  const [departmentProviders, setDepartmentProviders] = useState<Map<string, string | null>>(
    () => new Map(),
  );
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("");
  const debouncedTranscriptQuery = useDebouncedValue(transcriptSearchQuery);

  const filteredMessages = useMemo(() => {
    const messages = activeMeeting?.messages ?? [];
    return filterByQuery(messages, debouncedTranscriptQuery, (message) => [
      message.speaker_name,
      message.content,
      message.provider ?? "",
      message.speaker_id,
    ]);
  }, [activeMeeting?.messages, debouncedTranscriptQuery]);

  const selectableAgents = useMemo(
    () => agentRecords.filter((agent) => agent.agent_kind !== "fate"),
    [agentRecords],
  );
  const usingLiveLlm = aiStatus?.active_provider !== "mock";

  useEffect(() => {
    const load = async () => {
      try {
        const [status, departments] = await Promise.all([
          invoke<MeetingAiStatus>("get_meeting_ai_status"),
          invoke<CompanyDepartmentsSnapshot>("list_company_departments"),
        ]);
        setAiStatus(status);
        setDepartmentProviders(
          new Map(
            (departments.department_ai_providers ?? []).map((entry) => [
              entry.department,
              entry.ai_provider ?? null,
            ]),
          ),
        );
      } catch (error) {
        setStatusMessage(String(error));
      }
    };
    void load();
  }, [activeCompanyId, setStatusMessage]);

  useEffect(() => {
    if (agentRecords.length === 0) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => {
      const valid = current.filter((id) => agentRecords.some((agent) => agent.id === id));
      if (valid.length > 0) {
        return valid;
      }
      return agentRecords.slice(0, Math.min(2, agentRecords.length)).map((agent) => agent.id);
    });
  }, [agentRecords]);

  useEffect(() => {
    if (!onSectionFocus) {
      return;
    }
    const root = scrollRootRef.current?.closest(".app-page-content");
    const sections = scrollRootRef.current?.querySelectorAll("[data-meeting-section]");
    if (!root || !sections?.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-meeting-section");
        if (sectionId) {
          onSectionFocus(sectionId);
        }
      },
      { root, rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onSectionFocus, activeMeeting?.messages.length, activeMeeting?.completed]);

  const toggleAgent = (agentId: string) => {
    setSelectedIds((current) => {
      if (current.includes(agentId)) {
        return current.filter((id) => id !== agentId);
      }
      if (current.length >= 12) {
        setStatusMessage("Select up to 12 meeting participants.");
        return current;
      }
      return [...current, agentId];
    });
  };

  const startMeeting = async () => {
    try {
      const meeting = await invoke<MeetingSnapshot>("start_meeting", {
        request: {
          agent_ids: selectedIds,
          meeting_type: meetingType,
        },
      });
      setActiveMeeting(meeting);
      setStatusMessage(`Meeting started: ${meetingType}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const advanceMeeting = async () => {
    if (!activeMeeting || advancing) return;
    setAdvancing(true);
    reportLocalProgress("meeting_advance", "Advancing meeting turn…", -1, "llm");
    try {
      const meeting = await invoke<MeetingSnapshot>("advance_meeting", {
        meetingId: activeMeeting.id,
      });
      setActiveMeeting(meeting);
      if (!meeting.completed) {
        try {
          const estimate = await invoke<MeetingTurnCostEstimate>("estimate_meeting_turn_cost", {
            meetingId: meeting.id,
          });
          setTurnCost(estimate);
        } catch {
          setTurnCost(null);
        }
      } else {
        setTurnCost(null);
      }
      if (meeting.completed) {
        const outcome = meeting.outcome_summary ?? "Meeting completed.";
        setStatusMessage(
          `${outcome} Project +${(meeting.project_progress_delta * 100).toFixed(0)}%, revenue impact $${meeting.revenue_delta.toFixed(0)}.`,
        );
        const { refreshWorkspaceTree } = await import("../../services/workspaceClient");
        await refreshWorkspaceTree(true).catch(() => undefined);
      }
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      clearLocalProgress("meeting_advance");
      setAdvancing(false);
    }
  };

  useEffect(() => {
    if (!activeMeeting || activeMeeting.completed) {
      setTurnCost(null);
      return;
    }
    const loadCost = async () => {
      try {
        const estimate = await invoke<MeetingTurnCostEstimate>("estimate_meeting_turn_cost", {
          meetingId: activeMeeting.id,
        });
        setTurnCost(estimate);
      } catch (error) {
        setTurnCost(null);
        setStatusMessage(String(error));
      }
    };
    void loadCost();
  }, [activeMeeting, setStatusMessage]);

  useEffect(() => {
    if (!autoAdvance || !activeMeeting || activeMeeting.completed || advancing) {
      return;
    }
    if (turnCost && !turnCost.affordable) {
      return;
    }
    const delay = usingLiveLlm ? 3200 : 1400;
    const timer = window.setTimeout(() => {
      void advanceMeeting();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeMeeting, autoAdvance, advancing, usingLiveLlm, turnCost]);

  return (
    <div className="meeting-panel meeting-panel--page" ref={scrollRootRef}>
      <MeetingCard
        id="overview"
        title="LLM readiness"
        description="Active provider routing for meeting turns. Configure department and per-agent brains in Agent Brains."
      >
        {aiStatus ? (
          <div className="meeting-ai-status">
            <span className={`hub-pill ${usingLiveLlm ? "online" : "offline"}`}>
              LLM: {aiStatus.active_provider}
            </span>
            <span className="hub-pill tier">{aiStatus.configured_provider}</span>
            {aiStatus.ollama_reachable ? <span className="hub-pill online">Ollama ready</span> : null}
            {aiStatus.hub_reachable ? <span className="hub-pill online">Hub chat ready</span> : null}
            <p className="muted">{aiStatus.message}</p>
          </div>
        ) : (
          <p className="muted">Loading meeting AI status…</p>
        )}
      </MeetingCard>

      <MeetingCard
        id="session"
        title="Start or advance"
        description="Pick participants, start a session, and advance turns. Token cost estimates appear before each turn."
      >
        <label className="field-label">
          Meeting type
          <select value={meetingType} onChange={(event) => setMeetingType(event.target.value)}>
            {MEETING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <div className="agent-picker">
          {selectableAgents.map((agent) => (
            <label key={agent.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedIds.includes(agent.id)}
                onChange={() => toggleAgent(agent.id)}
              />
              <span>
                {formatAgentOptionLabel(agent)} ·{" "}
                {resolveEffectiveAiProviderLabel(
                  agent.ai_provider,
                  departmentProviders.get(agent.department) ?? null,
                  settings.ai_provider,
                )}
              </span>
            </label>
          ))}
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(event) => setAutoAdvance(event.target.checked)}
          />
          <span>Auto-advance turns (observable LLM chat)</span>
        </label>

        {turnCost ? (
          <p className={turnCost.affordable ? "muted" : "hub-warning"} role="status">
            {turnCost.message}
            {turnCost.estimated_tokens > 0 ? ` (~${turnCost.estimated_tokens} tokens)` : ""}
          </p>
        ) : null}

        <div className="panel-actions">
          <button type="button" onClick={() => void startMeeting()}>
            Start Meeting
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => void advanceMeeting()}
            disabled={
              !activeMeeting ||
              advancing ||
              (turnCost != null && !turnCost.affordable && !activeMeeting.completed)
            }
          >
            {advancing ? "Waiting for LLM..." : "Next Turn"}
          </button>
        </div>
      </MeetingCard>

      <MeetingCard
        id="transcript"
        title="Live transcript"
        description="Messages from each agent turn. Completed meetings sync notes to Workspace."
      >
        {activeMeeting ? (
          <div className="meeting-log">
            <h4>
              {activeMeeting.meeting_type}
              {activeMeeting.completed ? " · Completed" : ""}
              <span className="meeting-provider-pill">{activeMeeting.active_provider}</span>
              <span className="meeting-provider-pill">
                {activeMeeting.turns_per_agent} turns/agent
              </span>
            </h4>
            {activeMeeting.messages.length > 0 ? (
              <SearchableListToolbar
                query={transcriptSearchQuery}
                onQueryChange={setTranscriptSearchQuery}
                placeholder="Search transcript…"
                ariaLabel="Search meeting transcript"
                matchCount={
                  debouncedTranscriptQuery.trim() ? filteredMessages.length : undefined
                }
                totalCount={activeMeeting.messages.length}
              />
            ) : null}
            {activeMeeting.messages.length === 0 ? (
              <p className="muted">No messages yet. Press Next Turn.</p>
            ) : debouncedTranscriptQuery.trim() && filteredMessages.length === 0 ? (
              <p className="search-empty-hint muted">
                No matches for &ldquo;{debouncedTranscriptQuery}&rdquo;.
              </p>
            ) : (
              filteredMessages.map((message, index) => (
                <article key={`${message.speaker_id}-${index}`} className="meeting-message">
                  <header className="meeting-message-header">
                    <strong>{message.speaker_name}</strong>
                    {message.provider ? (
                      <span className="meeting-message-provider">{message.provider}</span>
                    ) : null}
                  </header>
                  <p>{message.content}</p>
                </article>
              ))
            )}
            {activeMeeting.completed && activeMeeting.outcome_summary ? (
              <p className="meeting-outcome">{activeMeeting.outcome_summary}</p>
            ) : null}
            {activeMeeting.completed && activeMeeting.notes_page_id ? (
              <div className="meeting-workspace-actions">
                <button
                  type="button"
                  className="secondary-action meeting-workspace-link"
                  onClick={() =>
                    void openWorkspacePage(
                      activeMeeting.notes_page_id!,
                      `${activeMeeting.meeting_type} notes`,
                    )
                  }
                >
                  Open meeting notes in Workspace
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted">Start a meeting to see the live transcript here.</p>
        )}
      </MeetingCard>
    </div>
  );
}