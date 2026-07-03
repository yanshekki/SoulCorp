import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IS_V2, showAgentMorale } from "../../config/features";
import { useGameStore } from "../../stores/gameStore";
import { totalCompanyTokens } from "../../utils/companyState";
import { resolveCandidateSoul } from "../../utils/candidateSoul";
import { recruitOnboardingTokensForCandidate } from "../../utils/recruitmentTokens";
import type {
  AgentRecord,
  MeetingSnapshot,
  MoraleHeatmapEntry,
  RecruitmentAnalytics,
  RecruitmentCandidate,
  RelationshipGraph,
  TokenEconomy,
} from "../../types/game";
import { RelationshipGraphView } from "./RelationshipGraphView";

const DEPARTMENTS = ["Engineering", "Human Resources", "Executive", "Marketing"];

export const RECRUITMENT_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "candidates", label: "Candidates" },
  { id: "team", label: "Team morale" },
  { id: "relationships", label: "Relationships" },
] as const;

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

interface RecruitmentPanelProps {
  onSectionFocus?: (sectionId: string) => void;
}

export function RecruitmentPanel({ onSectionFocus }: RecruitmentPanelProps) {
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const finance = useGameStore((state) => state.finance);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setFinance = useGameStore((state) => state.setFinance);
  const setActiveMeeting = useGameStore((state) => state.setActiveMeeting);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const agentRecords = useGameStore((state) => state.agentRecords);

  const [skillFilter, setSkillFilter] = useState("");
  const [heatmap, setHeatmap] = useState<MoraleHeatmapEntry[]>([]);
  const [relationshipGraph, setRelationshipGraph] = useState<RelationshipGraph | null>(null);
  const [analytics, setAnalytics] = useState<RecruitmentAnalytics | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [candidatesFromCache, setCandidatesFromCache] = useState(false);
  const [candidatesCacheMessage, setCandidatesCacheMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [result, morale, graph, recruitmentAnalytics] = await Promise.all([
          invoke<{
            candidates: RecruitmentCandidate[];
            from_cache: boolean;
            message?: string | null;
          }>("list_recruitment_candidates", {
            query: skillFilter.trim() || null,
          }),
          invoke<MoraleHeatmapEntry[]>("get_morale_heatmap"),
          invoke<RelationshipGraph>("get_agent_relationship_graph"),
          invoke<RecruitmentAnalytics>("get_recruitment_analytics", {
            query: skillFilter.trim() || null,
          }),
        ]);
        setCandidates(result.candidates);
        setCandidatesFromCache(result.from_cache);
        setCandidatesCacheMessage(result.message ?? null);
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
  }, [activeCompanyId, skillFilter, setStatusMessage]);

  useEffect(() => {
    if (!onSectionFocus) {
      return;
    }
    const root = scrollRootRef.current?.closest(".recruitment-page-scroll");
    const sections = scrollRootRef.current?.querySelectorAll("[data-recruitment-section]");
    if (!root || !sections?.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-recruitment-section");
        if (sectionId) {
          onSectionFocus(sectionId);
        }
      },
      { root, rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onSectionFocus, candidates.length, analytics, heatmap.length, relationshipGraph]);

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
      const panelAgents = agentRecords.slice(0, 3).map((agent) => agent.id);
      if (panelAgents.length === 0) {
        setStatusMessage("Hire or onboard agents before running interviews.");
        return;
      }
      const meeting = await invoke<MeetingSnapshot>("start_meeting", {
        request: {
          agent_ids: panelAgents,
          meeting_type: `Interview: ${names}`,
        },
      });
      await invoke<number>("record_recruitment_interview");
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
    const onboardingTokens = recruitOnboardingTokensForCandidate(candidate);
    const monthlySalary = onboardingTokens > 0 ? Math.round(onboardingTokens / 0.5) : 3500;
    if (totalCompanyTokens(finance) < onboardingTokens) {
      setStatusMessage(
        "Not enough company tokens to complete this hire. Top up finance or set per-agent limits in Agent Brains.",
      );
      return;
    }

    try {
      const resolvedSoul = await resolveCandidateSoul(candidate);
      const hired = await invoke<AgentRecord>("hire_candidate", {
        request: {
          candidate_id: candidate.id,
          role: candidate.job_role || candidate.vibe,
          department: candidate.department_fit ?? DEPARTMENTS[0],
          offered_salary: monthlySalary,
          soul_md_content: resolvedSoul.displayMd,
          system_prompt_source: resolvedSoul.systemPromptSource,
        },
      });
      const agents = await invoke<AgentRecord[]>("list_agents");
      setAgentRecords(agents);
      const updatedFinance = await invoke<TokenEconomy>("get_finance_state");
      setFinance(updatedFinance);
      const { refreshWorkspaceTree } = await import("../../services/workspaceClient");
      await refreshWorkspaceTree(true).catch(() => undefined);
      setStatusMessage(`${hired.name} joined the company as ${hired.role}.`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const scrollToCandidates = useCallback(() => {
    document.getElementById("candidates")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="recruitment-panel recruitment-panel--page" ref={scrollRootRef}>
      <section
        id="overview"
        className="recruitment-card recruitment-card--wide"
        data-recruitment-section="overview"
      >
        <header className="recruitment-card-header recruitment-card-header--stacked">
          <h3>Recruitment overview</h3>
          <p className="muted">
            Hub queue status, hiring funnel metrics, and compatibility scoring for the current
            candidate pool.
          </p>
        </header>

        <div className="hub-status-row">
          <span className="hub-pill tier">{hubStatus.user_tier}</span>
          {loading ? <span className="hub-pill offline">Loading souls…</span> : null}
          {hubStatus.user_tier === "pro" || hubStatus.user_tier === "vip" ? (
            <span className="hub-pill online">Priority matching</span>
          ) : (
            <span className="hub-pill offline">Standard queue</span>
          )}
        </div>

        {settings.pure_local_mode ? (
          <p className="hub-warning">
            Pure Local Mode: hub candidates are unavailable. Connect to soulmd-hub or use God Mode
            bonus recruits.
          </p>
        ) : null}
        {candidatesFromCache && candidatesCacheMessage ? (
          <p className="hub-warning" role="status">
            {candidatesCacheMessage}
          </p>
        ) : null}

        {analytics ? (
          <>
            <div className="recruitment-analytics">
              <div className="analytics-grid recruitment-stats-grid">
                <article>
                  <strong>{analytics.team_size}</strong>
                  <span>Team size</span>
                </article>
                {showAgentMorale ? (
                  <article>
                    <strong>{(analytics.average_morale * 100).toFixed(0)}%</strong>
                    <span>Avg morale</span>
                  </article>
                ) : null}
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
            </div>

            {analytics.candidate_scores.length > 0 ? (
              <div className="recruitment-scores-wrap">
                <h4>Compatibility leaderboard</h4>
                <table className="candidate-scores-table recruitment-scores-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Compatibility</th>
                      <th>Risk</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.candidate_scores.map((entry) => {
                      const interviewed = selectedIds.includes(entry.candidate_id);
                      return (
                        <tr key={entry.candidate_id}>
                          <td>{entry.name}</td>
                          <td>{(entry.compatibility_score * 100).toFixed(0)}%</td>
                          <td>
                            <span className={`fit-badge band-${entry.risk_band}`}>
                              {entry.risk_band.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td>{interviewed ? "Selected" : "Available"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">Loading recruitment analytics…</p>
        )}

        <div className="recruitment-card-actions">
          <button type="button" className="secondary-action" onClick={scrollToCandidates}>
            Browse candidates ({filteredCandidates.length})
          </button>
        </div>
      </section>

      <section
        id="candidates"
        className="recruitment-card recruitment-card--wide"
        data-recruitment-section="candidates"
      >
        <header className="recruitment-card-header">
          <div>
            <h3>Candidate pool</h3>
            <p className="muted recruitment-card-subtitle">
              Select up to 3 for a panel interview, or hire directly.
            </p>
          </div>
          <span className="recruitment-count-pill">
            {filteredCandidates.length} shown · {selectedIds.length}/3 selected
          </span>
        </header>

        <div className="recruitment-toolbar">
          <label className="field-label recruitment-filter">
            Filter by skill or name
            <input
              type="text"
              value={skillFilter}
              onChange={(event) => setSkillFilter(event.target.value)}
              placeholder="react, design, marketing…"
            />
          </label>
          <button
            type="button"
            className="primary-action"
            disabled={selectedIds.length === 0}
            onClick={() => void startInterview()}
          >
            Start interview ({selectedIds.length}/3)
          </button>
        </div>

        {filteredCandidates.length === 0 ? (
          <p className="muted">
            {loading ? "Loading candidates from soulmd-hub…" : "No candidates match this filter."}
          </p>
        ) : (
          <div className="candidate-list recruitment-candidate-grid">
            {filteredCandidates.map((candidate) => {
              const selected = selectedIds.includes(candidate.id);
              const scoreEntry = analyticsByCandidate.get(candidate.id);
              const compatibility = candidate.compatibility_score ?? scoreEntry?.compatibility_score;
              return (
                <article
                  key={candidate.id}
                  className={`candidate-card recruitment-candidate-card ${selected ? "selected" : ""}`}
                >
                  <header>
                    <div>
                      <strong>{candidate.name}</strong>
                      <p className="muted">
                        {candidate.job_role || candidate.vibe}
                        {candidate.headline ? ` · ${candidate.headline}` : ""}
                      </p>
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
                    {showAgentMorale && candidate.projected_morale_delta != null ? (
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
                    <span>{candidate.department_fit ?? "Flexible department"}</span>
                    <span>{candidate.verified ? "Verified" : "Unverified"}</span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {showAgentMorale ? (
      <section
        id="team"
        className="recruitment-card recruitment-card--wide"
        data-recruitment-section="team"
      >
        <header className="recruitment-card-header recruitment-card-header--stacked">
          <h3>Team morale heatmap</h3>
          <p className="muted">
            Morale and energy bands for current employees — use when judging cultural fit of new hires.
          </p>
        </header>

        {heatmap.length === 0 ? (
          <p className="muted">No agents to analyze yet. Hire your first teammate to unlock morale insights.</p>
        ) : (
          <div className="heatmap-grid recruitment-heatmap-grid">
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
      </section>
      ) : null}

      {IS_V2 ? (
      <section
        id="relationships"
        className="recruitment-card recruitment-card--wide"
        data-recruitment-section="relationships"
      >
        <header className="recruitment-card-header recruitment-card-header--stacked">
          <h3>Agent relationship graph</h3>
          <p className="muted">
            Collaboration strength between current agents — spot isolation risks before expanding the team.
          </p>
        </header>

        {relationshipGraph ? (
          <div className="relationship-graph-panel recruitment-relationship-panel">
            <RelationshipGraphView graph={relationshipGraph} />
          </div>
        ) : (
          <p className="muted">Relationship data appears once you have multiple agents on the roster.</p>
        )}
      </section>
      ) : null}
    </div>
  );
}