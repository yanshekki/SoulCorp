import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { DesignPresetPicker } from "../design/DesignPresetPicker";
import { presetDesignFor } from "../../data/presetDesigns";
import { INITIAL_BUILDINGS } from "../../data/initialWorld";
import { completeOnboarding } from "../../services/onboardingClient";
import { applyDesignPreset } from "../../services/visualDesignClient";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { useGameStore } from "../../stores/gameStore";
import { applyBuildingsVisualDesign } from "../../utils/applyVisualDesign";
import { DEFAULT_EVENT_CHANCE } from "../../data/playModeOptions";
import { defaultActivePanel, showOffice3D, showPauseMenu } from "../../config/features";
import { PlayModePicker, type PlayModeConfig } from "./PlayModePicker";
import {
  AgentRosterStep,
  defaultAgentRosterState,
  isAgentRosterValid,
} from "./AgentRosterStep";
import { toAgentRosterPayload } from "../../data/presetAgents";
import type { AgentRosterSlotState } from "../../data/presetAgents";
import { MeetingBrainPicker } from "./brain/MeetingBrainPicker";
import { ExecutionRuntimePicker } from "./brain/ExecutionRuntimePicker";
import type { GameSettings, RuntimeCatalog } from "../../types/game";
import { apiProviderIdForMeetingRegistry } from "../../utils/agentRuntimeCatalog";
import {
  ProjectSetupStep,
  defaultProjectSetupState,
  isProjectSetupValid,
  toProjectSetupPayload,
  type ProjectSetupState,
} from "./ProjectSetupStep";

const V1_STEPS = ["welcome", "agents", "projects", "connectivity"] as const;
const V2_STEPS = ["welcome", "style", "agents", "projects", "connectivity", "design", "tour"] as const;

const STEP_LABELS: Record<(typeof V1_STEPS)[number] | (typeof V2_STEPS)[number], string> = {
  welcome: "Company",
  style: "Mode",
  agents: "Agents",
  projects: "Projects",
  connectivity: "Connect",
  design: "Design",
  tour: "Tour",
};

const STEP_HINTS: Record<(typeof V1_STEPS)[number] | (typeof V2_STEPS)[number], string> = {
  welcome: "Enter your company profile to continue.",
  style: "Choose how you want to run this company.",
  agents: "Pick preset agents or recruit from hub — edit each soul.md before they join.",
  projects: "Name your first project — backlog and sprints start empty.",
  connectivity: "Choose cloud-connected or pure local operation.",
  design: "Optional starting look for your 3D campus.",
  tour: "Quick tour of your command center.",
};

const TOUR_ITEMS = [
  { panel: "Office", detail: "Watch agents move through the 3D office and track KPIs." },
  { panel: "Workspace", detail: "Write meeting notes, journals, and company docs." },
  { panel: "Marketplace", detail: "Accept gigs, deliver work, and collect USDT payouts." },
  { panel: "Meeting", detail: "Run multi-agent meetings that affect morale and revenue." },
];

export function OnboardingWizard() {
  const onboardingCompleted = useGameStore((state) => state.onboardingCompleted);
  const onboardingReady = useGameStore((state) => state.onboardingReady);
  const setOnboardingCompleted = useGameStore((state) => state.setOnboardingCompleted);
  const setSettings = useGameStore((state) => state.setSettings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const isPaused = useGameStore((state) => state.isPaused);
  const togglePause = useGameStore((state) => state.togglePause);

  const [stepIndex, setStepIndex] = useState(0);
  const [companyName, setCompanyNameInput] = useState("");
  const [industry, setIndustry] = useState("");
  const [tagline, setTagline] = useState("");
  const [playModeConfig, setPlayModeConfig] = useState<PlayModeConfig>({
    playMode: showOffice3D ? "game" : "work",
    randomEventsEnabled: showOffice3D,
    randomEventChance: DEFAULT_EVENT_CHANCE,
  });
  const steps = useMemo(() => (showOffice3D ? V2_STEPS : V1_STEPS), []);
  const [pureLocalMode, setPureLocalMode] = useState(false);
  const [designPresetId, setDesignPresetId] = useState<string | null>(null);
  const [agentRoster, setAgentRoster] = useState<AgentRosterSlotState[]>(defaultAgentRosterState());
  const [projectSetup, setProjectSetup] = useState<ProjectSetupState>(defaultProjectSetupState());
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog | null>(null);
  const [meetingBrainId, setMeetingBrainId] = useState("ollama");
  const [executionRuntimeId, setExecutionRuntimeId] = useState("llm_only");
  const [submitting, setSubmitting] = useState(false);

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!showPauseMenu || !onboardingReady || onboardingCompleted) {
      return;
    }
    if (!isPaused) {
      togglePause();
    }
  }, [isPaused, onboardingCompleted, onboardingReady, togglePause]);

  useEffect(() => {
    void invoke<RuntimeCatalog>("get_agent_runtime_catalog")
      .then(setRuntimeCatalog)
      .catch(() => setRuntimeCatalog(null));
  }, []);

  if (!onboardingReady || onboardingCompleted) {
    return null;
  }

  const goNext = () => {
    if (step === "welcome" && companyName.trim().length < 2) {
      setStatusMessage("Enter a company name with at least 2 characters.");
      return;
    }
    if (step === "agents" && !isAgentRosterValid(agentRoster, pureLocalMode)) {
      setStatusMessage("Complete all three agent slots with valid soul.md content.");
      return;
    }
    if (step === "projects" && !isProjectSetupValid(projectSetup)) {
      setStatusMessage("Enter a project title with at least 2 characters.");
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const finish = async () => {
    if (companyName.trim().length < 2) {
      setStatusMessage("Enter a company name with at least 2 characters.");
      return;
    }
    if (!isAgentRosterValid(agentRoster, pureLocalMode)) {
      setStatusMessage("Complete all three agent slots with valid soul.md content.");
      return;
    }
    if (!isProjectSetupValid(projectSetup)) {
      setStatusMessage("Enter a project title with at least 2 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await completeOnboarding({
        company_name: companyName.trim(),
        company_industry: industry.trim(),
        company_tagline: tagline.trim(),
        play_mode: playModeConfig.playMode,
        pure_local_mode: pureLocalMode,
        random_events_enabled:
          playModeConfig.playMode === "game" && playModeConfig.randomEventsEnabled,
        random_event_chance: playModeConfig.randomEventChance,
        agent_roster: toAgentRosterPayload(agentRoster),
        ...toProjectSetupPayload(projectSetup),
      });
      const nextAiProvider = pureLocalMode
        ? "mock"
        : apiProviderIdForMeetingRegistry(meetingBrainId, runtimeCatalog);
      const nextRuntimeMode = pureLocalMode ? "llm_only" : executionRuntimeId;
      const updatedSettings = await invoke<GameSettings>("update_game_settings", {
        update: {
          ai_provider: nextAiProvider,
          agent_runtime_mode: nextRuntimeMode,
        },
      });
      setSettings({
        ...updatedSettings,
        play_mode: playModeConfig.playMode,
        pure_local_mode: pureLocalMode,
        random_events_enabled:
          playModeConfig.playMode === "game" && playModeConfig.randomEventsEnabled,
        random_event_chance: playModeConfig.randomEventChance,
        pixel_filter_enabled: false,
        crt_filter_enabled: false,
      });
      if (designPresetId && designPresetId !== "default") {
        await applyDesignPreset(designPresetId);
      }
      await reloadGameState();
      setOnboardingCompleted(true);
      setActivePanel(defaultActivePanel);
      if (showPauseMenu && useGameStore.getState().isPaused) {
        useGameStore.getState().togglePause();
      }
      setStatusMessage(
        showOffice3D
          ? `Welcome to ${result.company_name}. Your office simulation is live.`
          : `Welcome to ${result.company_name}. Your AI company platform is ready.`,
      );
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-overlay onboarding-overlay-blocking" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div
        className={`onboarding-wizard ${
          step === "style" || step === "agents" || step === "projects"
            ? "onboarding-wizard-wide"
            : ""
        }`}
      >
        <header className="onboarding-header">
          <p className="modal-eyebrow">First launch setup</p>
          <h2 id="onboarding-title">Set up your first company</h2>
          <p className="muted">
            Step {stepIndex + 1} of {steps.length} — {STEP_LABELS[step]}: {STEP_HINTS[step]}
          </p>
        </header>

        <div className="onboarding-progress onboarding-progress-labeled" aria-label="Onboarding progress">
          {steps.map((item, index) => (
            <span
              key={item}
              className={`onboarding-progress-item ${index <= stepIndex ? "active" : ""}`}
            >
              <span className="onboarding-dot" aria-hidden="true" />
              <span className="onboarding-progress-label">{STEP_LABELS[item]}</span>
            </span>
          ))}
        </div>

        {step === "welcome" ? (
          <section className="onboarding-step">
            <h3>Company profile</h3>
            <p className="muted">
              Tell us about the company you want to run. You can create more companies later.
            </p>
            <label className="field-label">
              Company name
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyNameInput(event.target.value)}
                maxLength={48}
                autoFocus
                placeholder="e.g. Nova Labs"
              />
            </label>
            <label className="field-label">
              Industry
              <input
                type="text"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                maxLength={64}
                placeholder="e.g. AI SaaS, Game Studio"
              />
            </label>
            <label className="field-label">
              Tagline / mission
              <input
                type="text"
                value={tagline}
                onChange={(event) => setTagline(event.target.value)}
                maxLength={120}
                placeholder="What is this company trying to build?"
              />
            </label>
          </section>
        ) : null}

        {step === "style" ? (
          <section className="onboarding-step onboarding-step-style">
            <h3>Game Mode or Work Mode?</h3>
            <PlayModePicker value={playModeConfig} onChange={setPlayModeConfig} />
          </section>
        ) : null}

        {step === "agents" ? (
          <>
            <div className="onboarding-step onboarding-step-inline-choice">
              <p className="muted">
                Recruitment uses soulmd-hub when connected. Switch to Pure Local if you want custom
                soul.md only.
              </p>
              <div className="onboarding-choice-grid agent-roster-mode-grid">
                <button
                  type="button"
                  className={`onboarding-choice ${!pureLocalMode ? "selected" : ""}`}
                  onClick={() => setPureLocalMode(false)}
                >
                  <strong>Hub recruitment</strong>
                  <span>Browse hub candidates for recruit slots.</span>
                </button>
                <button
                  type="button"
                  className={`onboarding-choice ${pureLocalMode ? "selected" : ""}`}
                  onClick={() => setPureLocalMode(true)}
                >
                  <strong>Pure Local recruit</strong>
                  <span>Paste custom soul.md for recruit slots.</span>
                </button>
              </div>
            </div>
            <AgentRosterStep
              pureLocalMode={pureLocalMode}
              value={agentRoster}
              onChange={setAgentRoster}
            />
          </>
        ) : null}

        {step === "projects" ? (
          <ProjectSetupStep
            value={projectSetup}
            onChange={setProjectSetup}
            companyName={companyName}
          />
        ) : null}

        {step === "connectivity" ? (
          <section className="onboarding-step">
            <h3>Cloud or local?</h3>
            <p className="muted">
              soulmd-hub powers marketplace gigs, recruitment, and cloud sync. Pure Local Mode keeps
              everything on your machine with mock AI dialogue.
            </p>
            {!showOffice3D ? (
              <p className="muted onboarding-llm-hint">
                After setup, open <strong>Settings → AI Provider</strong> to connect Ollama or an API
                key for real meetings and task execution. The background worker and orchestrator start
                enabled by default.
              </p>
            ) : null}
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
                <span>Offline-only play. Marketplace uses your last hub sync cache.</span>
              </button>
            </div>
            {!pureLocalMode ? (
              <>
                <label className="field-label">
                  Meeting brain (optional)
                  <MeetingBrainPicker
                    catalog={runtimeCatalog}
                    value={meetingBrainId}
                    includeInherit={false}
                    onChange={setMeetingBrainId}
                  />
                </label>
                <label className="field-label">
                  Execution runtime (optional)
                  <ExecutionRuntimePicker
                    catalog={runtimeCatalog}
                    value={executionRuntimeId}
                    includeInherit={false}
                    onChange={setExecutionRuntimeId}
                  />
                </label>
                <p className="muted">
                  Defaults to Ollama meetings and in-app LLM execution. Change anytime in Settings.
                </p>
              </>
            ) : null}
          </section>
        ) : null}

        {step === "design" ? (
          <section className="onboarding-step">
            <h3>Design your 3D campus</h3>
            <p className="muted">
              Pick a starting look for buildings and campus theme. You can fully customize departments,
              offices, and agent appearances later in <strong>3D Design</strong>.
            </p>
            <DesignPresetPicker
              compact
              selectedId={designPresetId}
              onSelect={(presetId) => {
                setDesignPresetId(presetId);
                if (presetId === "default") {
                  return;
                }
                const draft = presetDesignFor(presetId);
                useGameStore.getState().setVisualDesign(draft);
                useGameStore
                  .getState()
                  .setBuildings(applyBuildingsVisualDesign(INITIAL_BUILDINGS, draft));
              }}
            />
            {designPresetId && designPresetId !== "default" ? (
              <div
                className="onboarding-preset-preview"
                style={{
                  background: `linear-gradient(180deg, ${presetDesignFor(designPresetId).campus.sky_top}, ${presetDesignFor(designPresetId).campus.sky_bottom})`,
                }}
                aria-hidden
              />
            ) : null}
            {designPresetId ? (
              <p className="onboarding-ready-copy">Selected preset: {designPresetId}</p>
            ) : (
              <p className="muted">Optional — skip with Next to keep the classic campus.</p>
            )}
          </section>
        ) : null}

        {step === "tour" ? (
          <section className="onboarding-step">
            <h3>Your command center</h3>
            <p className="muted">
              Use the top navigation to switch panels while agents work in the 3D office.
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
              {companyName.trim()} is ready. Your founding agents join with the soul.md profiles you
              configured
              {playModeConfig.playMode === "game" ? ", and Fate will watch from the Meta office" : ""}.
            </p>
          </section>
        ) : null}

        <footer className="onboarding-actions">
          <button type="button" onClick={goBack} disabled={stepIndex === 0 || submitting}>
            Back
          </button>
          {!isLastStep ? (
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
              {submitting ? "Starting..." : showOffice3D ? "Start simulation" : "Get started"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}