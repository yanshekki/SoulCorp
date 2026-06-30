import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { AgentRecord, RecruitmentCandidate } from "../../types/game";

const DEPARTMENTS = ["Engineering", "Human Resources", "Executive", "Marketing"];

export function RecruitmentPanel() {
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const finance = useGameStore((state) => state.finance);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setFinance = useGameStore((state) => state.setFinance);

  const [skillFilter, setSkillFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await invoke<RecruitmentCandidate[]>("list_recruitment_candidates", {
          query: skillFilter.trim() || null,
        });
        setCandidates(result);
      } catch (error) {
        setStatusMessage(String(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [skillFilter, setStatusMessage]);

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

  const startInterview = () => {
    if (selectedIds.length === 0) {
      setStatusMessage("Pick at least one candidate to interview.");
      return;
    }
    setActivePanel("meeting");
    setStatusMessage(
      `Interview scheduled with ${selectedIds.length} candidate(s). Open Meeting panel to begin.`,
    );
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
        <button type="button" className="primary-action" onClick={startInterview}>
          Start interview ({selectedIds.length}/3)
        </button>
      </div>
    </section>
  );
}