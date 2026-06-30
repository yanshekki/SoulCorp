import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type {
  AgentRecord,
  MeetingSnapshot,
  MoraleHeatmapEntry,
  RecruitmentAnalytics,
  RecruitmentCandidate,
  RelationshipGraph,
} from "../../types/game";
import { RelationshipGraphView } from "./RelationshipGraphView";

const DEPARTMENTS = ["Engineering", "Human Resources", "Executive", "Marketing"];

function compatibilityLabel(score: number | null | undefined): string {
  if (score == null) {
    return "—";
  }
  if (score >= 0.75) {
    return "Strong fit";
  }
  if (score >= 0.55) {
    return "Balanced";
  }
  return "Stretch hire";
}

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
  const [relationshipGraph, setRelationshipGraph] = useState<RelationshipGraph | null>(null);
  const [analytics, setAnalytics] = useState<RecruitmentAnalytics | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [result, morale, graph, recruitmentAnalytics] = await Promise.all([
          invoke<RecruitmentCandidate[]>("list_recruitment_candidates", {
            query: skillFilter.trim() || null,
          }),
          invoke<MoraleHeatmapEntry[]>("get_morale_heatmap"),
          invoke<RelationshipGraph>("get_agent_relationship_graph"),
          invoke<RecruitmentAnalytics>("get_recruitment_analytics", {
            query: skillFilter.trim() || null,
          }),
        ]);
        setCandidates(result);
        setHeatmap(morale);
        setRelationshipGraph(graph);
        setAnalytics(recruitmentAnalytics);
      } catch (error) {
        setStatusMessage(String(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [skillFilter, setStatusMessage, agentRecords.length]);

  const analyticsByCandidate = useMemo(() => {
    const map = new Map(
      (analytics?.candidate_scores ?? []).map((entry) => [entry.candidate_id, entry]),
    );
    return map;
  }, [analytics]);

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
      await invoke<number>("record_recruitment_interview");
      const panelAgents = agentRecords.slice(0, 3).map((agent) => agent.id);
      const meeting = await invoke<MeetingSnapshot>("start_meeting", {
        request: {
          agent_ids: panelAgents.length > 0 ? panelAgents : ["agent-1", "agent-2"],
          meeting_type: `Interview: ${names}`,
        },
      });
      setActiveMeeting(meeting);
      setActivePanel("meeting");
      setStatusMessage(`Interview started for ${names}. HR and COO are leading the panel.`);
      const recruitmentAnalytics = await invoke<RecruitmentAnalytics>("get_recruitment_analytics", {
        query: skillFilter.trim() || null,
      });
      setAnalytics(recruitmentAnalytics);
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
          department: candidate.department_fit ?? DEPARTMENTS[0],
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
        Browse SOUL.md personas from soulmd-hub, review team fit analytics, and map agent relationships.
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

      {analytics ? (
        <div className="recruitment-analytics">
          <h3>Recruitment analytics</h3>
          <div className="analytics-grid">
            <article>
              <strong>{analytics.team_size}</strong>
              <span>Team size</span>
            </article>
            <article>
              <strong>{(analytics.average_morale * 100).toFixed(0)}%</strong>
              <span>Avg morale</span>
            </article>
            <article>
              <strong>{analytics.agents_hired}</strong>
              <span>Hires</span>
            </article>
            <article>
              <strong>{analytics.interviews_started}</strong>
              <span>Interviews</span>
            </article>
          </div>
          {analytics.skill_gaps.length > 0 ? (
            <div className="skill-tags analytics-gaps">
              <span className="analytics-gaps-label">Skill gaps:</span>
              {analytics.skill_gaps.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          ) : (
            <p className="muted">Current roster covers the visible candidate skill set.</p>
          )}
          {analytics.priority_matching ? (
            <p className="tier-highlight">Pro/VIP priority matching boosts compatibility scoring.</p>
          ) : null}
          {analytics.candidate_scores.length > 0 ? (
            <table className="candidate-scores-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Compatibility</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {analytics.candidate_scores.map((entry) => (
                  <tr key={entry.candidate_id}>
                    <td>{entry.name}</td>
                    <td>{(entry.compatibility_score * 100).toFixed(0)}%</td>
                    <td>{entry.risk_band}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}

      <div className="relationship-graph-panel">
        <h3>Agent relationship graph</h3>
        {relationshipGraph ? <RelationshipGraphView graph={relationshipGraph} /> : null}
      </div>

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
          const scoreEntry = analyticsByCandidate.get(candidate.id);
          const compatibility = candidate.compatibility_score ?? scoreEntry?.compatibility_score;
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
              <div className="candidate-fit-row">
                <span className={`fit-badge band-${scoreEntry?.risk_band ?? "balanced"}`}>
                  {compatibilityLabel(compatibility)} ·{" "}
                  {compatibility != null ? `${(compatibility * 100).toFixed(0)}%` : "—"}
                </span>
                {candidate.department_fit ? (
                  <span className="muted">Best fit: {candidate.department_fit}</span>
                ) : null}
                {candidate.projected_morale_delta != null ? (
                  <span className="muted">
                    Morale impact +{(candidate.projected_morale_delta * 100).toFixed(1)}%
                  </span>
                ) : null}
              </div>
              <div className="skill-tags">
                {candidate.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              {candidate.skill_overlap && candidate.skill_overlap.length > 0 ? (
                <p className="candidate-overlap muted">
                  Overlap: {candidate.skill_overlap.join(", ")}
                </p>
              ) : null}
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