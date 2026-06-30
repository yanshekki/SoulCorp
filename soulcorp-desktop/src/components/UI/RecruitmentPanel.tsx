import { useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { RecruitmentCandidate } from "../../types/game";

const MOCK_CANDIDATES: RecruitmentCandidate[] = [
  {
    id: "cand-1",
    name: "Lena Park",
    headline: "Full-stack builder with calm leadership vibe",
    skills: ["react", "rust", "product"],
    vibe: "steady",
    verified: true,
    hourly_rate_usdt: 48,
  },
  {
    id: "cand-2",
    name: "Theo Alvarez",
    headline: "Growth marketer who writes like a founder",
    skills: ["copywriting", "seo", "analytics"],
    vibe: "bold",
    verified: true,
    hourly_rate_usdt: 36,
  },
  {
    id: "cand-3",
    name: "Sora Iwata",
    headline: "Design systems + pixel-perfect UI craft",
    skills: ["figma", "tailwind", "motion"],
    vibe: "creative",
    verified: false,
    hourly_rate_usdt: 42,
  },
];

export function RecruitmentPanel() {
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const [skillFilter, setSkillFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const candidates = useMemo(() => {
    const query = skillFilter.trim().toLowerCase();
    if (!query) {
      return MOCK_CANDIDATES;
    }
    return MOCK_CANDIDATES.filter(
      (candidate) =>
        candidate.skills.some((skill) => skill.includes(query)) ||
        candidate.name.toLowerCase().includes(query) ||
        candidate.headline.toLowerCase().includes(query),
    );
  }, [skillFilter]);

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
      `Interview scheduled with ${selectedIds.length} soulmd-hub candidate(s). Open Meeting panel to begin.`,
    );
  };

  return (
    <section className="panel-card recruitment-panel">
      <h2>Recruitment</h2>
      <p className="muted">
        Browse verified SOUL.md personas from soulmd-hub and run multi-agent interviews.
      </p>

      <div className="hub-status-row">
        <span className="hub-pill tier">{hubStatus.user_tier}</span>
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
        {candidates.map((candidate) => {
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
                <button type="button" onClick={() => toggleCandidate(candidate.id)}>
                  {selected ? "Selected" : "Select"}
                </button>
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