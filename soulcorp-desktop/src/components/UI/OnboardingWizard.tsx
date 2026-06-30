import { useEffect, useMemo, useState } from "react";
import { completeOnboarding } from "../../services/onboardingClient";
import { useGameStore } from "../../stores/gameStore";
import type { EventMode } from "../../types/game";

const STEPS = ["welcome", "style", "connectivity", "tour"] as const;

const STYLE_OPTIONS: {
  id: EventMode;
  title: string;
  description: string;
  events: boolean;
}[] = [
  {
    id: "fun",
    title: "Fun Mode",
    description: "Chaotic events, drama, and surprise twists while you build.",
    events: true,
  },
  {
    id: "balanced",
    title: "Balanced Mode",
    description: "A mix of productivity pressure and occasional office drama.",
    events: true,
  },
  {
    id: "serious",
    title: "Serious Work Mode",
    description: "Pure productivity. Random events are disabled.",
    events: false,
  },
];

const TOUR_ITEMS = [
  { panel: "Office", detail: "Watch agents move through the 3D office and track KPIs." },
  { panel: "Workspace", detail: "Write meeting notes, journals, and company docs." },
  { panel: "Marketplace", detail: "Accept gigs, deliver work, and collect USDT payouts." },
  { panel: "Meeting", detail: "Run multi-agent meetings that affect morale and revenue." },
];

export function OnboardingWizard() {
  const onboardingCompleted = useGameStore((state) => state.onboardingCompleted);
  const onboardingReady = useGameStore((state) => state.onboardingReady);
  const setCompanyName = useGameStore((state) => state.setCompanyName);
  const setOnboardingCompleted = useGameStore((state) => state.setOnboardingCompleted);
  const setSettings = useGameStore((state) => state.setSettings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const isPaused = useGameStore((state) => state.isPaused);
  const togglePause = useGameStore((state) => state.togglePause);

  const [stepIndex, setStepIndex] = useState(0);
  const [companyName, setCompanyNameInput] = useState("SoulCorp");
  const [eventMode, setEventMode] = useState<EventMode>("fun");
  const [pureLocalMode, setPureLocalMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const step = STEPS[stepIndex];
  const selectedStyle = useMemo(
    () => STYLE_OPTIONS.find((option) => option.id === eventMode) ?? STYLE_OPTIONS[0],
    [eventMode],
  );

  useEffect(() => {
    if (!onboardingReady || onboardingCompleted) {
      return;
    }
    if (!isPaused) {
      togglePause();
    }
  }, [isPaused, onboardingCompleted, onboardingReady, togglePause]);

  if (!onboardingReady || onboardingCompleted) {
    return null;
  }

  const goNext = () => {
    if (step === "welcome" && companyName.trim().length < 2) {
      setStatusMessage("Enter a company name with at least 2 characters.");
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const skipForNow = async () => {
    setSubmitting(true);
    try {
      const result = await completeOnboarding({
        company_name: "SoulCorp",
        event_mode: "balanced",
        pure_local_mode: false,
        random_events_enabled: true,
      });
      setCompanyName(result.company_name);
      setOnboardingCompleted(true);
      setActivePanel("office");
      if (isPaused) {
        togglePause();
      }
      setStatusMessage("Onboarding skipped — defaults applied.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const finish = async () => {
    setSubmitting(true);
    try {
      const result = await completeOnboarding({
        company_name: companyName.trim(),
        event_mode: eventMode,
        pure_local_mode: pureLocalMode,
        random_events_enabled: selectedStyle.events,
      });
      setCompanyName(result.company_name);
      setOnboardingCompleted(true);
      setSettings({
        ...useGameStore.getState().settings,
        event_mode: eventMode,
        pure_local_mode: pureLocalMode,
        random_events_enabled: selectedStyle.events,
        ai_provider: pureLocalMode ? "mock" : useGameStore.getState().settings.ai_provider,
      });
      setActivePanel("office");
      if (isPaused) {
        togglePause();
      }
      setStatusMessage(`Welcome to ${result.company_name}. Your office simulation is live.`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-wizard">
        <header className="onboarding-header">
          <p className="modal-eyebrow">First launch setup</p>
          <h2 id="onboarding-title">Build your AI company</h2>
          <p className="muted">Step {stepIndex + 1} of {STEPS.length}</p>
        </header>

        <div className="onboarding-progress">
          {STEPS.map((item, index) => (
            <span
              key={item}
              className={`onboarding-dot ${index <= stepIndex ? "active" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        {step === "welcome" ? (
          <section className="onboarding-step">
            <h3>Name your company</h3>
            <p className="muted">
              This label appears on your dashboard, exports, and reports.
            </p>
            <label className="field-label">
              Company name
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyNameInput(event.target.value)}
                maxLength={48}
                autoFocus
              />
            </label>
          </section>
        ) : null}

        {step === "style" ? (
          <section className="onboarding-step">
            <h3>Choose your play style</h3>
            <p className="muted">You can change this later in Settings.</p>
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
          </section>
        ) : null}

        {step === "connectivity" ? (
          <section className="onboarding-step">
            <h3>Cloud or local?</h3>
            <p className="muted">
              soulmd-hub powers marketplace gigs, recruitment, and cloud sync. Pure Local Mode keeps
              everything on your machine.
            </p>
            <div className="onboarding-choice-grid">
              <button
                type="button"
                className={`onboarding-choice ${!pureLocalMode ? "selected" : ""}`}
                onClick={() => setPureLocalMode(false)}
              >
                <strong>Connected (recommended)</strong>
                <span>Marketplace, recruitment, and optional cloud sync.</span>
              </button>
              <button
                type="button"
                className={`onboarding-choice ${pureLocalMode ? "selected" : ""}`}
                onClick={() => setPureLocalMode(true)}
              >
                <strong>Pure Local Mode</strong>
                <span>Offline-only play with mock marketplace data.</span>
              </button>
            </div>
          </section>
        ) : null}

        {step === "tour" ? (
          <section className="onboarding-step">
            <h3>Your command center</h3>
            <p className="muted">
              Use the sidebar to switch panels while agents work in the 3D office.
            </p>
            <ul className="onboarding-tour-list">
              {TOUR_ITEMS.map((item) => (
                <li key={item.panel}>
                  <strong>{item.panel}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
            <p className="onboarding-ready-copy">
              {companyName.trim()} is ready. Mira, Kai, and Ren are already online.
            </p>
          </section>
        ) : null}

        <footer className="onboarding-actions">
          <button type="button" className="onboarding-skip" onClick={() => void skipForNow()} disabled={submitting}>
            Skip for now
          </button>
          <button type="button" onClick={goBack} disabled={stepIndex === 0 || submitting}>
            Back
          </button>
          {step !== "tour" ? (
            <button type="button" className="primary-action" onClick={goNext}>
              Next
            </button>
          ) : (
            <button
              type="button"
              className="primary-action"
              onClick={() => void finish()}
              disabled={submitting}
            >
              {submitting ? "Starting..." : "Start simulation"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}