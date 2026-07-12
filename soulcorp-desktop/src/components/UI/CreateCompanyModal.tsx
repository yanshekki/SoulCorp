import { useState } from "react";
import { DesignPresetPicker } from "../design/DesignPresetPicker";
import { createCompany } from "../../services/companyClient";
import { applyDesignPreset } from "../../services/visualDesignClient";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { useGameStore } from "../../stores/gameStore";
import { DEFAULT_EVENT_CHANCE } from "../../data/playModeOptions";
import {
  defaultActivePanel,
  showDesignStudio,
  showPlayModeSettings,
  simulationAutoRun,
} from "../../config/features";
import { PlayModePicker, type PlayModeConfig } from "./PlayModePicker";
import {
  AgentRosterStep,
  defaultAgentRosterState,
  isAgentRosterValid,
} from "./AgentRosterStep";
import { toAgentRosterPayload } from "../../data/presetAgents";
import type { AgentRosterSlotState } from "../../data/presetAgents";
import {
  ProjectSetupStep,
  defaultProjectSetupState,
  isProjectSetupValid,
  toProjectSetupPayload,
  type ProjectSetupState,
} from "./ProjectSetupStep";
import { useI18n } from "../../i18n/I18nProvider";

export function CreateCompanyModal() {
  const { t } = useI18n();
  const showCreateCompany = useGameStore((state) => state.showCreateCompany);
  const setShowCreateCompany = useGameStore((state) => state.setShowCreateCompany);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setActivePanel = useGameStore((state) => state.setActivePanel);

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [tagline, setTagline] = useState("");
  const [playModeConfig, setPlayModeConfig] = useState<PlayModeConfig>({
    playMode: "work",
    randomEventsEnabled: false,
    randomEventChance: DEFAULT_EVENT_CHANCE,
  });
  const [pureLocalMode, setPureLocalMode] = useState(false);
  const [designPresetId, setDesignPresetId] = useState<string | null>(null);
  const [openDesignStudioAfter, setOpenDesignStudioAfter] = useState(false);
  const [agentRoster, setAgentRoster] = useState<AgentRosterSlotState[]>(defaultAgentRosterState());
  const [projectSetup, setProjectSetup] = useState<ProjectSetupState>(defaultProjectSetupState());
  const [submitting, setSubmitting] = useState(false);

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
      await createCompany({
        company_name: companyName.trim(),
        industry: industry.trim(),
        tagline: tagline.trim(),
        play_mode: playModeConfig.playMode,
        pure_local_mode: pureLocalMode,
        random_events_enabled:
          playModeConfig.playMode === "game" && playModeConfig.randomEventsEnabled,
        random_event_chance: playModeConfig.randomEventChance,
        agent_roster: toAgentRosterPayload(agentRoster),
        ...toProjectSetupPayload(projectSetup),
      });
      if (designPresetId && designPresetId !== "default") {
        await applyDesignPreset(designPresetId);
      }
      await reloadGameState();
      setActivePanel(
        showDesignStudio && openDesignStudioAfter ? "design_studio" : defaultActivePanel,
      );
      useGameStore.setState({ isPaused: !simulationAutoRun });
      setShowCreateCompany(false);
      setCompanyName("");
      setIndustry("");
      setTagline("");
      setPlayModeConfig({
        playMode: "work",
        randomEventsEnabled: false,
        randomEventChance: DEFAULT_EVENT_CHANCE,
      });
      setPureLocalMode(false);
      setDesignPresetId(null);
      setOpenDesignStudioAfter(false);
      setAgentRoster(defaultAgentRosterState());
      setProjectSetup(defaultProjectSetupState());
      setStatusMessage(
        showDesignStudio
          ? `Created ${companyName.trim()}. Your new office is live.`
          : `Created ${companyName.trim()}. Your company is ready.`,
      );
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="create-company-title">
      <div className="onboarding-wizard onboarding-wizard-wide create-company-modal">
        <header className="onboarding-header">
          <p className="modal-eyebrow">{t("createCompany.eyebrow")}</p>
          <h2 id="create-company-title">{t("createCompany.title")}</h2>
          <p className="muted">{t("createCompany.desc")}</p>
        </header>

        <section className="onboarding-step">
          <label className="field-label">
            {t("createCompany.name")}
            <input
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              maxLength={48}
              autoFocus
            />
          </label>
          <label className="field-label">
            {t("createCompany.industry")}
            <input
              type="text"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              maxLength={64}
              placeholder={t("createCompany.industryPh")}
            />
          </label>
          <label className="field-label">
            {t("createCompany.tagline")}
            <input
              type="text"
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              maxLength={120}
              placeholder={t("createCompany.taglinePh")}
            />
          </label>

          {showPlayModeSettings ? (
            <>
              <h3>{t("createCompany.playStyle")}</h3>
              <PlayModePicker compact value={playModeConfig} onChange={setPlayModeConfig} />
            </>
          ) : null}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={pureLocalMode}
              onChange={(event) => setPureLocalMode(event.target.checked)}
            />
            {t("createCompany.pureLocal")}
          </label>

          {showDesignStudio ? (
            <>
              <h3>{t("createCompany.campusLook")}</h3>
              <p className="muted">{t("createCompany.campusHint")}</p>
              <DesignPresetPicker
                compact
                selectedId={designPresetId}
                onSelect={(presetId) => setDesignPresetId(presetId)}
              />

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={openDesignStudioAfter}
                  onChange={(event) => setOpenDesignStudioAfter(event.target.checked)}
                />
                {t("createCompany.openDesign")}
              </label>
            </>
          ) : null}

          <AgentRosterStep
            pureLocalMode={pureLocalMode}
            value={agentRoster}
            onChange={setAgentRoster}
          />

          <ProjectSetupStep
            value={projectSetup}
            onChange={setProjectSetup}
            companyName={companyName}
          />
        </section>

        <footer className="onboarding-actions">
          <button type="button" className="onboarding-skip" onClick={close} disabled={submitting}>
            {t("createCompany.cancel")}
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? t("createCompany.creating") : t("createCompany.create")}
          </button>
        </footer>
      </div>
    </div>
  );
}