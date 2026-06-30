import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { MeetingSnapshot } from "../../types/game";

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

  const selectableAgents = useMemo(() => agentRecords, [agentRecords]);

  const toggleAgent = (agentId: string) => {
    setSelectedIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId],
    );
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
    if (!activeMeeting) return;
    try {
      const meeting = await invoke<MeetingSnapshot>("advance_meeting", {
        meeting_id: activeMeeting.id,
      });
      setActiveMeeting(meeting);
      if (meeting.completed) {
        setStatusMessage("Meeting completed. Morale updated.");
      }
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <section className="panel-card">
      <h2>Call Meeting</h2>
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

      <div className="panel-actions">
        <button type="button" onClick={() => void startMeeting()}>
          Start Meeting
        </button>
        <button type="button" onClick={() => void advanceMeeting()} disabled={!activeMeeting}>
          Next Turn
        </button>
      </div>

      {activeMeeting && (
        <div className="meeting-log">
          <h3>
            {activeMeeting.meeting_type}
            {activeMeeting.completed ? " · Completed" : ""}
          </h3>
          {activeMeeting.messages.length === 0 ? (
            <p className="muted">No messages yet. Press Next Turn.</p>
          ) : (
            activeMeeting.messages.map((message, index) => (
              <article key={`${message.speaker_id}-${index}`} className="meeting-message">
                <strong>{message.speaker_name}</strong>
                <p>{message.content}</p>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}