import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { MeetingAiStatus, MeetingSnapshot } from "../../types/game";

const MEETING_TYPES = [
  "Daily Standup",
  "Project Kickoff",
  "Crisis Meeting",
  "Team Building",
  "Strategy Discussion",
];

export function MeetingPanel() {
  const agentRecords = useGameStore((state) => state.agentRecords);
  const activeMeeting = useGameStore((state) => state.activeMeeting);
  const setActiveMeeting = useGameStore((state) => state.setActiveMeeting);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [meetingType, setMeetingType] = useState(MEETING_TYPES[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["agent-1", "agent-2"]);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [aiStatus, setAiStatus] = useState<MeetingAiStatus | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const selectableAgents = useMemo(() => agentRecords, [agentRecords]);
  const usingLiveLlm = aiStatus?.active_provider !== "mock";

  useEffect(() => {
    const load = async () => {
      try {
        const status = await invoke<MeetingAiStatus>("get_meeting_ai_status");
        setAiStatus(status);
      } catch (error) {
        setStatusMessage(String(error));
      }
    };
    void load();
  }, [setStatusMessage]);

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
    try {
      const meeting = await invoke<MeetingSnapshot>("advance_meeting", {
        meeting_id: activeMeeting.id,
      });
      setActiveMeeting(meeting);
      if (meeting.completed) {
        const outcome = meeting.outcome_summary ?? "Meeting completed.";
        setStatusMessage(
          `${outcome} Project +${(meeting.project_progress_delta * 100).toFixed(0)}%, revenue impact $${meeting.revenue_delta.toFixed(0)}.`,
        );
      }
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setAdvancing(false);
    }
  };

  useEffect(() => {
    if (!autoAdvance || !activeMeeting || activeMeeting.completed || advancing) {
      return;
    }
    const delay = usingLiveLlm ? 3200 : 1400;
    const timer = window.setTimeout(() => {
      void advanceMeeting();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeMeeting, autoAdvance, advancing, usingLiveLlm]);

  return (
    <section className="panel-card meeting-panel">
      <h2>Call Meeting</h2>
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
      ) : null}

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
              {agent.name} · {agent.department}
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

      <div className="panel-actions">
        <button type="button" onClick={() => void startMeeting()}>
          Start Meeting
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => void advanceMeeting()}
          disabled={!activeMeeting || advancing}
        >
          {advancing ? "Waiting for LLM..." : "Next Turn"}
        </button>
      </div>

      {activeMeeting && (
        <div className="meeting-log">
          <h3>
            {activeMeeting.meeting_type}
            {activeMeeting.completed ? " · Completed" : ""}
            <span className="meeting-provider-pill">{activeMeeting.active_provider}</span>
            <span className="meeting-provider-pill">
              {activeMeeting.turns_per_agent} turns/agent
            </span>
          </h3>
          {activeMeeting.messages.length === 0 ? (
            <p className="muted">No messages yet. Press Next Turn.</p>
          ) : (
            activeMeeting.messages.map((message, index) => (
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
        </div>
      )}
    </section>
  );
}