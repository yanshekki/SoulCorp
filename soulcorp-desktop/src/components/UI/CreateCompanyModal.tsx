import { useMemo, useState } from "react";
import { createCompany } from "../../services/companyClient";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { useGameStore } from "../../stores/gameStore";
import type { EventMode } from "../../types/game";

const STYLE_OPTIONS: {
  id: EventMode;
  title: string;
  description: string;
  events: boolean;
}[] = [
  {
    id: "fun",
    title: "Fun Mode",
    description: "Chaotic events and surprise twists.",
    events: true,
  },
  {
    id: "balanced",
    title: "Balanced Mode",
    description: "Productivity with occasional drama.",
    events: true,
  },
  {
    id: "serious",
    title: "Serious Work Mode",
    description: "Pure productivity. No random events.",
    events: false,
  },
];

export function CreateCompanyModal() {
  const showCreateCompany = useGameStore((state) => state.showCreateCompany);
  const setShowCreateCompany = useGameStore((state) => state.setShowCreateCompany);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setActivePanel = useGameStore((state) => state.setActivePanel);

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [tagline, setTagline] = useState("");
  const [eventMode, setEventMode] = useState<EventMode>("balanced");
  const [pureLocalMode, setPureLocalMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedStyle = useMemo(
    () => STYLE_OPTIONS.find((option) => option.id === eventMode) ?? STYLE_OPTIONS[1],
    [eventMode],
  );

  if (!showCreateCompany) {
    return null;
  }

  const close = () => {
    if (!submitting) {
      setShowCreateCompany(false);
    }
  };

  const submit = async () => {
    if (companyName.trim().length < 2) {
      setStatusMessage("Enter a company name with at least 2 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await createCompany({
        company_name: companyName.trim(),
        industry: industry.trim(),
        tagline: tagline.trim(),
        event_mode: eventMode,
        pure_local_mode: pureLocalMode,
        random_events_enabled: selectedStyle.events,
      });
      await reloadGameState();
      setActivePanel("office");
      setShowCreateCompany(false);
      setCompanyName("");
      setIndustry("");
      setTagline("");
      setEventMode("balanced");
      setPureLocalMode(false);
      setStatusMessage(`Created ${companyName.trim()}. Your new office is live.`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="create-company-title">
      <div className="onboarding-wizard create-company-modal">
        <header className="onboarding-header">
          <p className="modal-eyebrow">Multi-company</p>
          <h2 id="create-company-title">Start another company</h2>
          <p className="muted">Each company keeps its own agents, finance, and workspace.</p>
        </header>

        <section className="onboarding-step">
          <label className="field-label">
            Company name
            <input
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              maxLength={48}
              autoFocus
            />
          </label>
          <label className="field-label">
            Industry
            <input
              type="text"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              maxLength={64}
              placeholder="e.g. AI SaaS, Game Studio, Consulting"
            />
          </label>
          <label className="field-label">
            Tagline / mission
            <input
              type="text"
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              maxLength={120}
              placeholder="What does this company aim to build?"
            />
          </label>

          <h3>Play style</h3>
          <div className="onboarding-choice-grid">
            {STYLE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`onboarding-choice ${eventMode === option.id ? "selected" : ""}`}
                onClick={() => setEventMode(option.id)}
              >
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={pureLocalMode}
              onChange={(event) => setPureLocalMode(event.target.checked)}
            />
            Pure Local Mode (offline-only for this company)
          </label>
        </section>

        <footer className="onboarding-actions">
          <button type="button" className="onboarding-skip" onClick={close} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create company"}
          </button>
        </footer>
      </div>
    </div>
  );
}