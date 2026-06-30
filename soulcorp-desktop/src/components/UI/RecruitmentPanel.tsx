import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type {
  AgentRecord,
  MeetingSnapshot,
  MoraleHeatmapEntry,
  RecruitmentCandidate,
} from "../../types/game";

const DEPARTMENTS = ["Engineering", "Human Resources", "Executive", "Marketing"];

export function RecruitmentPanel() {
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const finance = useGameStore((state) => state.finance);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setFinance = useGameStore((state) => state.setFinance);
  const setActiveMeeting = useGameStore((state) => state.setActiveMeeting);
  const agentRecords = useGameStore((state) => state.agentRecords);

  const [skillFilter, setSkillFilter] = useState("");
  const [heatmap, setHeatmap] = useState<MoraleHeatmapEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [result, morale] = await Promise.all([
          invoke<RecruitmentCandidate[]>("list_recruitment_candidates", {
            query: skillFilter.trim() || null,
          }),
          invoke<MoraleHeatmapEntry[]>("get_morale_heatmap"),
        ]);
        setCandidates(result);
        setHeatmap(morale);
      } catch (error) {
        setStatusMessage(String(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [skillFilter, setStatusMessage, agentRecords.length]);

  const filteredCandidates = useMemo(() => {
    const query = skillFilter.trim().toLowerCase();
    if (!query) {
      return candidates;
    }
    return candidates.filter(
      (candidate) =>
        candidate.skills.some((skill) => skill.includes(query)) ||
        candidate.name.toLowerCase().includes(query) ||
        candidate.headline.toLowerCase().includes(query),
    );
  }, [candidates, skillFilter]);

  const toggleCandidate = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }
      if (current.length >= 3) {
        setStatusMessage("Select up to 3 candidates for interview.");
        return current;
      }
      return [...current, id];
    });
  };

  const startInterview = async () => {
    if (selectedIds.length === 0) {
      setStatusMessage("Pick at least one candidate to interview.");
      return;
    }
    const names = selectedIds
      .map((id) => candidates.find((candidate) => candidate.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    try {
      const meeting = await invoke<MeetingSnapshot>("start_meeting", {
        request: {
          agent_ids: ["agent-2", "agent-3"],
          meeting_type: `Interview: ${names}`,
        },
      });
      setActiveMeeting(meeting);
      setActivePanel("meeting");
      setStatusMessage(`Interview started for ${names}. HR and COO are leading the panel.`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const hireCandidate = async (candidate: RecruitmentCandidate) => {
    const monthlySalary = candidate.hourly_rate_usdt * 160;
    if (finance.cash_balance < monthlySalary * 0.5) {
      setStatusMessage("Not enough cash for onboarding package.");
      return;
    }

    try {
      const hired = await invoke<AgentRecord>("hire_candidate", {
        request: {
          candidate_id: candidate.id,
          role: candidate.vibe,
          department: DEPARTMENTS[0],
          offered_salary: monthlySalary,
          soul_md_content: candidate.soul_md_content,
        },
      });
      const agents = await invoke<AgentRecord[]>("list_agents");
      setAgentRecords(agents);
      const updatedFinance = await invoke<typeof finance>("get_finance_state");
      setFinance(updatedFinance);
      setStatusMessage(`${hired.name} joined the company as ${hired.role}.`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <section className="panel-card recruitment-panel">
      <h2>Recruitment</h2>
      <p className="muted">
        Browse SOUL.md personas from soulmd-hub and onboard them into your office.
      </p>

      <div className="hub-status-row">
        <span className="hub-pill tier">{hubStatus.user_tier}</span>
        {loading ? <span className="hub-pill offline">Loading souls...</span> : null}
        {hubStatus.user_tier === "pro" || hubStatus.user_tier === "vip" ? (
          <span className="hub-pill online">Priority matching</span>
        ) : (
          <span className="hub-pill offline">Standard queue</span>
        )}
      </div>

      {settings.pure_local_mode ? (
        <p className="hub-warning">Pure Local Mode: showing offline candidate samples.</p>
      ) : null}

      <div className="morale-heatmap">
        <h3>Team morale heatmap</h3>
        {heatmap.length === 0 ? (
          <p className="muted">No agents to analyze yet.</p>
        ) : (
          <div className="heatmap-grid">
            {heatmap.map((entry) => (
              <article key={entry.agent_id} className={`heatmap-cell band-${entry.risk_band}`}>
                <strong>{entry.name}</strong>
                <span>{entry.department}</span>
                <span>
                  Morale {(entry.morale * 100).toFixed(0)}% · Energy {(entry.energy * 100).toFixed(0)}%
                </span>
              </article>
            ))}
          </div>
        )}
      </div>

      <label className="field-label">
        Filter by skill or name
        <input
          type="text"
          value={skillFilter}
          onChange={(event) => setSkillFilter(event.target.value)}
          placeholder="react, design, marketing..."
        />
      </label>

      <div className="candidate-list">
        {filteredCandidates.map((candidate) => {
          const selected = selectedIds.includes(candidate.id);
          return (
            <article
              key={candidate.id}
              className={`candidate-card ${selected ? "selected" : ""}`}
            >
              <header>
                <div>
                  <strong>{candidate.name}</strong>
                  <p className="muted">{candidate.headline}</p>
                </div>
                <div className="candidate-actions">
                  <button type="button" onClick={() => toggleCandidate(candidate.id)}>
                    {selected ? "Selected" : "Select"}
                  </button>
                  <button type="button" onClick={() => void hireCandidate(candidate)}>
                    Hire
                  </button>
                </div>
              </header>
              <div className="skill-tags">
                {candidate.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <footer>
                <span>{candidate.vibe} vibe</span>
                <span>${candidate.hourly_rate_usdt}/hr</span>
                <span>{candidate.verified ? "Verified" : "Unverified"}</span>
              </footer>
            </article>
          );
        })}
      </div>

      <div className="panel-actions">
        <button type="button" className="primary-action" onClick={() => void startInterview()}>
          Start interview ({selectedIds.length}/3)
        </button>
      </div>
    </section>
  );
}