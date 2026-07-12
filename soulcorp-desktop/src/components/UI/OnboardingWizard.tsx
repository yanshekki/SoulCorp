import { invoke } from "../../utils/tauriInvoke";
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
import { useI18n } from "../../i18n/I18nProvider";

const V1_STEPS = ["welcome", "agents", "projects", "connectivity"] as const;
const V2_STEPS = ["welcome", "style", "agents", "projects", "connectivity", "design", "tour"] as const;

type OnboardingStepId = (typeof V1_STEPS)[number] | (typeof V2_STEPS)[number];

const STEP_LABEL_KEYS: Record<OnboardingStepId, string> = {
  welcome: "onboarding.step.welcome",
  style: "onboarding.step.style",
  agents: "onboarding.step.agents",
  projects: "onboarding.step.projects",
  connectivity: "onboarding.step.connectivity",
  design: "onboarding.step.design",
  tour: "onboarding.step.tour",
};

const STEP_HINT_KEYS: Record<OnboardingStepId, string> = {
  welcome: "onboarding.desc.welcome",
  style: "onboarding.desc.style",
  agents: "onboarding.desc.agents",
  projects: "onboarding.desc.projects",
  connectivity: "onboarding.desc.connectivity",
  design: "onboarding.desc.design",
  tour: "onboarding.desc.tour",
};

const TOUR_ITEMS = [
  { panelKey: "nav.office", detailKey: "onboarding.tour.office" },
  { panelKey: "nav.workspace", detailKey: "onboarding.tour.workspace" },
  { panelKey: "nav.marketplace", detailKey: "onboarding.tour.marketplace" },
  { panelKey: "nav.meeting", detailKey: "onboarding.tour.meeting" },
];

export function OnboardingWizard() {
  const { t } = useI18n();
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
      setStatusMessage(t("createCompany.needName"));
      return;
    }
    if (step === "agents" && !isAgentRosterValid(agentRoster, pureLocalMode)) {
      setStatusMessage(t("createCompany.needAgents"));
      return;
    }
    if (step === "projects" && !isProjectSetupValid(projectSetup)) {
      setStatusMessage(t("createCompany.needProject"));
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const finish = async () => {
    if (companyName.trim().length < 2) {
      setStatusMessage(t("createCompany.needName"));
      return;
    }
    if (!isAgentRosterValid(agentRoster, pureLocalMode)) {
      setStatusMessage(t("createCompany.needAgents"));
      return;
    }
    if (!isProjectSetupValid(projectSetup)) {
      setStatusMessage(t("createCompany.needProject"));
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
          <p className="modal-eyebrow">{t("onboarding.firstLaunch")}</p>
          <h2 id="onboarding-title">{t("onboarding.setupTitle")}</h2>
          <p className="muted">
            Step {stepIndex + 1} of {steps.length} — {t(STEP_LABEL_KEYS[step])}:{" "}
            {t(STEP_HINT_KEYS[step])}
          </p>
        </header>

        <div
          className="onboarding-progress onboarding-progress-labeled"
          aria-label={t("onboarding.progress")}
        >
          {steps.map((item, index) => (
            <span
              key={item}
              className={`onboarding-progress-item ${index <= stepIndex ? "active" : ""}`}
            >
              <span className="onboarding-dot" aria-hidden="true" />
              <span className="onboarding-progress-label">{t(STEP_LABEL_KEYS[item])}</span>
            </span>
          ))}
        </div>

        {step === "welcome" ? (
          <section className="onboarding-step">
            <h3>{t("onboarding.companyProfile")}</h3>
            <p className="muted">{t("onboarding.companyProfileDesc")}</p>
            <label className="field-label">
              {t("onboarding.companyName")}
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyNameInput(event.target.value)}
                maxLength={48}
                autoFocus
                placeholder={t("onboarding.namePh")}
              />
            </label>
            <label className="field-label">
              {t("onboarding.industry")}
              <input
                type="text"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                maxLength={64}
                placeholder={t("onboarding.industryPh")}
              />
            </label>
            <label className="field-label">
              {t("onboarding.tagline")}
              <input
                type="text"
                value={tagline}
                onChange={(event) => setTagline(event.target.value)}
                maxLength={120}
                placeholder={t("createCompany.taglinePh")}
              />
            </label>
          </section>
        ) : null}

        {step === "style" ? (
          <section className="onboarding-step onboarding-step-style">
            <h3>{t("onboarding.modeQuestion")}</h3>
            <PlayModePicker value={playModeConfig} onChange={setPlayModeConfig} />
          </section>
        ) : null}

        {step === "agents" ? (
          <>
            <div className="onboarding-step onboarding-step-inline-choice">
              <p className="muted">{t("onboarding.recruitNote")}</p>
              <div className="onboarding-choice-grid agent-roster-mode-grid">
                <button
                  type="button"
                  className={`onboarding-choice ${!pureLocalMode ? "selected" : ""}`}
                  onClick={() => setPureLocalMode(false)}
                >
                  <strong>{t("onboarding.hubRecruit")}</strong>
                  <span>{t("onboarding.hubRecruitDesc")}</span>
                </button>
                <button
                  type="button"
                  className={`onboarding-choice ${pureLocalMode ? "selected" : ""}`}
                  onClick={() => setPureLocalMode(true)}
                >
                  <strong>{t("onboarding.localRecruit")}</strong>
                  <span>{t("onboarding.localRecruitDesc")}</span>
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
            <h3>{t("onboarding.cloudOrLocal")}</h3>
            <p className="muted">{t("onboarding.cloudOrLocalDesc")}</p>
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
                <strong>{t("onboarding.connected")}</strong>
                <span>{t("onboarding.connectedDesc")}</span>
              </button>
              <button
                type="button"
                className={`onboarding-choice ${pureLocalMode ? "selected" : ""}`}
                onClick={() => setPureLocalMode(true)}
              >
                <strong>{t("onboarding.pureLocalChoice")}</strong>
                <span>{t("onboarding.pureLocalChoiceDesc")}</span>
              </button>
            </div>
            {!pureLocalMode ? (
              <>
                <label className="field-label">
                  {t("onboarding.meetingBrainOpt")}
                  <MeetingBrainPicker
                    catalog={runtimeCatalog}
                    value={meetingBrainId}
                    includeInherit={false}
                    onChange={setMeetingBrainId}
                  />
                </label>
                <label className="field-label">
                  {t("onboarding.executionRuntimeOpt")}
                  <ExecutionRuntimePicker
                    catalog={runtimeCatalog}
                    value={executionRuntimeId}
                    includeInherit={false}
                    onChange={setExecutionRuntimeId}
                  />
                </label>
                <p className="muted">{t("onboarding.defaultsNote")}</p>
              </>
            ) : null}
          </section>
        ) : null}

        {step === "design" ? (
          <section className="onboarding-step">
            <h3>{t("onboarding.designCampus")}</h3>
            <p className="muted">{t("onboarding.designCampusDesc")}</p>
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
              <p className="onboarding-ready-copy">
                {t("onboarding.selectedPreset", { id: designPresetId })}
              </p>
            ) : (
              <p className="muted">{t("onboarding.skipDesign")}</p>
            )}
          </section>
        ) : null}

        {step === "tour" ? (
          <section className="onboarding-step">
            <h3>{t("onboarding.commandCenter")}</h3>
            <p className="muted">{t("onboarding.commandCenterDesc")}</p>
            <ul className="onboarding-tour-list">
              {TOUR_ITEMS.map((item) => (
                <li key={item.panelKey}>
                  <strong>{t(item.panelKey)}</strong>
                  <span>{t(item.detailKey)}</span>
                </li>
              ))}
            </ul>
            <p className="onboarding-ready-copy">
              {t("onboarding.companyReady", { name: companyName.trim() || "—" })}
              {playModeConfig.playMode === "game" ? "" : ""}
            </p>
          </section>
        ) : null}

        <footer className="onboarding-actions">
          <button type="button" onClick={goBack} disabled={stepIndex === 0 || submitting}>
            {t("common.previous")}
          </button>
          {!isLastStep ? (
            <button type="button" className="primary-action" onClick={goNext}>
              {t("common.next")}
            </button>
          ) : (
            <button
              type="button"
              className="primary-action"
              onClick={() => void finish()}
              disabled={submitting}
            >
              {submitting
                ? t("onboarding.starting")
                : showOffice3D
                  ? t("onboarding.startSim")
                  : t("onboarding.getStarted")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}