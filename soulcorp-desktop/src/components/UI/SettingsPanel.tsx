import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "../../utils/tauriInvoke";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { patchAudioSettings, setAudioMuted } from "../../hooks/useAudioSettings";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { AudioMuteButton } from "./AudioMuteButton";
import { updateHubConfig } from "../../services/hubClient";
import { useCompanyScope } from "../../hooks/useCompanyScope";
import { useGameStore } from "../../stores/gameStore";
import { DEFAULT_EVENT_CHANCE } from "../../data/playModeOptions";
import {
  showAudioSettings,
  showDisplaySettings,
  showPlayModeSettings,
} from "../../config/features";
import { PlayModePicker, type PlayModeConfig } from "./PlayModePicker";
import { MeetingBrainPicker } from "./brain/MeetingBrainPicker";
import type {
  DeployResult,
  DeployStatus,
  ExportResult,
  GameSettings,
  HubStatus,
  MeetingAiStatus,
  ProviderCredentialProbe,
  RuntimeCatalog,
} from "../../types/game";
import {
  apiProviderIdForMeetingRegistry,
  effectiveApiProviderForSettings,
  legacyMeetingProviderToRegistryId,
} from "../../utils/agentRuntimeCatalog";
import {
  checkForAppUpdate,
  downloadAndInstallUpdate,
  type UpdateProgress,
} from "../../services/updaterClient";
import { APP_LANGUAGES, parseAppLanguage } from "../../i18n";
import { useI18n } from "../../i18n/I18nProvider";

export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "play", label: "Play mode" },
  { id: "display", label: "Display" },
  { id: "audio", label: "Audio" },
  { id: "cloud", label: "Cloud & hub" },
  { id: "ai", label: "AI providers" },
  { id: "meetings", label: "Meetings" },
  { id: "backup", label: "Backup & export" },
  { id: "deploy", label: "Deploy" },
] as const;

interface SettingsPanelProps {
  activeSection: string;
}

const SettingsActiveSectionContext = createContext<string>("general");

function ProviderConnectionStatus({
  status,
  probe,
  busyDisabled,
  onTest,
  idleHint,
}: {
  status: "idle" | "checking" | "ok" | "error";
  probe: ProviderCredentialProbe | null;
  busyDisabled?: boolean;
  onTest: () => void;
  idleHint?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`provider-status provider-status--${status}`} role="status" aria-live="polite">
      <span className={`provider-status-light provider-status-light--${status}`} aria-hidden="true" />
      <div className="provider-status-body">
        <strong className="provider-status-title">
          {status === "checking"
            ? t("settings.probe.testing")
            : status === "ok"
              ? t("settings.probe.ok")
              : status === "error"
                ? t("settings.probe.failed")
                : t("settings.probe.idle")}
        </strong>
        <p className="provider-status-message muted">
          {probe?.message
            ?? idleHint
            ?? t("settings.probe.defaultHint")}
        </p>
      </div>
      <button
        type="button"
        className="secondary-action"
        disabled={status === "checking" || busyDisabled}
        onClick={onTest}
      >
        {status === "checking" ? t("settings.probe.testingBtn") : t("settings.probe.testBtn")}
      </button>
    </div>
  );
}

function SettingsCard({
  id,
  title,
  description,
  wide,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const activeSection = useContext(SettingsActiveSectionContext);
  // Observatory activity stream sits under AI providers nav (not a separate left item).
  const visible =
    activeSection === id || (id === "observatory" && activeSection === "ai");
  if (!visible) {
    return null;
  }
  return (
    <section
      id={id}
      className={`settings-card${wide ? " settings-card--wide" : ""}`}
      data-settings-section={id}
    >
      <header className="settings-card-header">
        <h3>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
      </header>
      <div className="settings-card-body">{children}</div>
    </section>
  );
}

export function SettingsPanel({ activeSection }: SettingsPanelProps) {
  const { t } = useI18n();
  const { activeCompanyId, companyRevision } = useCompanyScope();
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const setSettings = useGameStore((state) => state.setSettings);
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const [hubUrl, setHubUrl] = useState(hubStatus.base_url);
  const [apiKey, setApiKey] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null);
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [githubRepoName, setGithubRepoName] = useState("");
  const [deployBusy, setDeployBusy] = useState(false);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog | null>(null);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  // Local drafts for AI credentials — never call update_game_settings on every keystroke
  // (that serializes + commits full app state and freezes the UI under the scrum worker).
  const [draftOpenaiKey, setDraftOpenaiKey] = useState(settings.openai_api_key ?? "");
  const [draftGrokKey, setDraftGrokKey] = useState(settings.grok_api_key ?? "");
  const [draftClaudeKey, setDraftClaudeKey] = useState(settings.claude_api_key ?? "");
  const [draftDeepseekKey, setDraftDeepseekKey] = useState(settings.deepseek_api_key ?? "");
  const [draftOpenaiUrl, setDraftOpenaiUrl] = useState(settings.openai_base_url ?? "");
  const [draftOpenaiModel, setDraftOpenaiModel] = useState(settings.openai_model ?? "");
  const [draftGrokUrl, setDraftGrokUrl] = useState(settings.grok_base_url ?? "");
  const [draftGrokModel, setDraftGrokModel] = useState(settings.grok_model ?? "");
  const [draftClaudeUrl, setDraftClaudeUrl] = useState(settings.claude_base_url ?? "");
  const [draftClaudeModel, setDraftClaudeModel] = useState(settings.claude_model ?? "");
  const [draftDeepseekUrl, setDraftDeepseekUrl] = useState(settings.deepseek_base_url ?? "");
  const [draftDeepseekModel, setDraftDeepseekModel] = useState(settings.deepseek_model ?? "");
  const [draftOllamaUrl, setDraftOllamaUrl] = useState(settings.ollama_base_url ?? "");
  const [draftOllamaModel, setDraftOllamaModel] = useState(settings.ollama_model ?? "");
  /** idle | checking | ok | error — green/red light after save or Test */
  const [providerProbeStatus, setProviderProbeStatus] = useState<
    "idle" | "checking" | "ok" | "error"
  >("idle");
  const [providerProbe, setProviderProbe] = useState<ProviderCredentialProbe | null>(null);
  const [hubProbeStatus, setHubProbeStatus] = useState<"idle" | "checking" | "ok" | "error">(
    "idle",
  );
  const [hubProbe, setHubProbe] = useState<ProviderCredentialProbe | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const effectiveApiProvider = effectiveApiProviderForSettings(settings.ai_provider, runtimeCatalog);
  const meetingBrainValue = legacyMeetingProviderToRegistryId(settings.ai_provider);

  useEffect(() => {
    setHubUrl(hubStatus.base_url);
  }, [hubStatus.base_url]);

  useEffect(() => {
    setDraftOpenaiKey(settings.openai_api_key ?? "");
    setDraftGrokKey(settings.grok_api_key ?? "");
    setDraftClaudeKey(settings.claude_api_key ?? "");
    setDraftDeepseekKey(settings.deepseek_api_key ?? "");
    setDraftOpenaiUrl(settings.openai_base_url ?? "");
    setDraftOpenaiModel(settings.openai_model ?? "");
    setDraftGrokUrl(settings.grok_base_url ?? "");
    setDraftGrokModel(settings.grok_model ?? "");
    setDraftClaudeUrl(settings.claude_base_url ?? "");
    setDraftClaudeModel(settings.claude_model ?? "");
    setDraftDeepseekUrl(settings.deepseek_base_url ?? "");
    setDraftDeepseekModel(settings.deepseek_model ?? "");
    setDraftOllamaUrl(settings.ollama_base_url ?? "");
    setDraftOllamaModel(settings.ollama_model ?? "");
  }, [
    settings.openai_api_key,
    settings.grok_api_key,
    settings.claude_api_key,
    settings.deepseek_api_key,
    settings.openai_base_url,
    settings.openai_model,
    settings.grok_base_url,
    settings.grok_model,
    settings.claude_base_url,
    settings.claude_model,
    settings.deepseek_base_url,
    settings.deepseek_model,
    settings.ollama_base_url,
    settings.ollama_model,
    activeCompanyId,
  ]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    void invoke<GameSettings>("get_game_settings")
      .then(setSettings)
      .catch((error) => setStatusMessage(String(error)));
  }, [activeCompanyId, companyRevision, setSettings, setStatusMessage]);

  useEffect(() => {
    void invoke<RuntimeCatalog>("get_agent_runtime_catalog")
      .then(setRuntimeCatalog)
      .catch(() => setRuntimeCatalog(null));
  }, []);

  useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("1.0.0"));
  }, []);

  // When opening AI providers or Meetings, auto-probe so the light reflects current key state.
  useEffect(() => {
    if ((activeSection !== "ai" && activeSection !== "meetings") || !activeCompanyId) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        void runProviderProbe(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe on section open / company only
  }, [activeSection, activeCompanyId, settings.ai_provider]);

  // Cloud & hub section: auto-probe hub credentials.
  useEffect(() => {
    if (activeSection !== "cloud" || !activeCompanyId) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        void runHubProbe(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe on section open only
  }, [activeSection, activeCompanyId]);

  const checkAppUpdate = async () => {
    setUpdateBusy(true);
    setUpdateProgress({
      downloaded: 0,
      contentLength: null,
      phase: "checking",
      message: t("settings.checkingUpdates"),
    });
    try {
      const update = await checkForAppUpdate();
      setPendingUpdate(update);
      setUpdateProgress({
        downloaded: 0,
        contentLength: null,
        phase: "idle",
        message: update
          ? `Update available: v${update.version}`
          : `SoulCorp v${appVersion} is up to date.`,
      });
    } catch (error) {
      setPendingUpdate(null);
      setUpdateProgress({
        downloaded: 0,
        contentLength: null,
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setUpdateBusy(false);
    }
  };

  const installAppUpdate = async () => {
    if (!pendingUpdate) {
      return;
    }
    setUpdateBusy(true);
    try {
      await downloadAndInstallUpdate(pendingUpdate, setUpdateProgress);
    } catch (error) {
      setUpdateProgress({
        downloaded: 0,
        contentLength: null,
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      setUpdateBusy(false);
    }
  };

  useEffect(() => {
    if (activeSection !== "deploy") {
      return;
    }
    let cancelled = false;
    setDeployBusy(true);
    void invoke<DeployStatus>("get_deploy_status")
      .then((status) => {
        if (!cancelled) {
          setDeployStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDeployStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDeployBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  const runProviderProbe = async (announce = true) => {
    setProviderProbeStatus("checking");
    try {
      const result = await invoke<ProviderCredentialProbe>("test_meeting_provider");
      setProviderProbe(result);
      setProviderProbeStatus(result.ok ? "ok" : "error");
      if (announce) {
        setStatusMessage(result.message);
      }
      return result;
    } catch (error) {
      const message = String(error);
      setProviderProbe({
        ok: false,
        provider: effectiveApiProvider,
        has_credentials: false,
        message,
      });
      setProviderProbeStatus("error");
      if (announce) {
        setStatusMessage(message);
      }
      return null;
    }
  };

  const runHubProbe = async (announce = true) => {
    setHubProbeStatus("checking");
    try {
      const result = await invoke<ProviderCredentialProbe>("test_hub_connection");
      setHubProbe(result);
      setHubProbeStatus(result.ok ? "ok" : "error");
      if (announce) {
        setStatusMessage(result.message);
      }
      // Refresh hub status pill (connected flag may have updated).
      try {
        const status = await invoke<HubStatus>("get_hub_status");
        setHubStatus(status);
      } catch {
        // non-fatal
      }
      return result;
    } catch (error) {
      const message = String(error);
      setHubProbe({
        ok: false,
        provider: "soulmd-hub",
        has_credentials: false,
        message,
      });
      setHubProbeStatus("error");
      if (announce) {
        setStatusMessage(message);
      }
      return null;
    }
  };

  const updateSettings = async (
    patch: Partial<GameSettings>,
    options?: { probeAfter?: boolean },
  ) => {
    try {
      const next = await invoke<GameSettings>("update_game_settings", {
        update: {
          app_language: patch.app_language,
          play_mode: patch.play_mode,
          random_events_enabled: patch.random_events_enabled,
          random_event_chance: patch.random_event_chance,
          god_mode_enabled: patch.god_mode_enabled,
          ai_provider: patch.ai_provider,
          agent_runtime_mode: patch.agent_runtime_mode,
          ollama_base_url: patch.ollama_base_url,
          ollama_model: patch.ollama_model,
          openai_base_url: patch.openai_base_url,
          openai_api_key: patch.openai_api_key,
          openai_model: patch.openai_model,
          grok_base_url: patch.grok_base_url,
          grok_api_key: patch.grok_api_key,
          grok_model: patch.grok_model,
          claude_base_url: patch.claude_base_url,
          claude_api_key: patch.claude_api_key,
          claude_model: patch.claude_model,
          deepseek_base_url: patch.deepseek_base_url,
          deepseek_api_key: patch.deepseek_api_key,
          deepseek_model: patch.deepseek_model,
          meeting_turns_per_agent: patch.meeting_turns_per_agent,
          meeting_llm_fallback: patch.meeting_llm_fallback,
          pure_local_mode: patch.pure_local_mode,
          pixel_filter_enabled: patch.pixel_filter_enabled,
          crt_filter_enabled: patch.crt_filter_enabled,
          low_power_mode: patch.low_power_mode,
          backup_interval_minutes: patch.backup_interval_minutes,
          music_enabled: patch.music_enabled,
          music_volume: patch.music_volume,
          sfx_enabled: patch.sfx_enabled,
          sfx_volume: patch.sfx_volume,
          scrum_auto_schedule: patch.scrum_auto_schedule,
          scrum_auto_execute: patch.scrum_auto_execute,
        },
      });
      setSettings(next);
      setStatusMessage(t("common.settingsUpdated"));
      if (options?.probeAfter) {
        await runProviderProbe(true);
      }
    } catch (error) {
      setStatusMessage(String(error));
      if (options?.probeAfter) {
        setProviderProbeStatus("error");
        setProviderProbe({
          ok: false,
          provider: effectiveApiProvider,
          has_credentials: false,
          message: String(error),
        });
      }
    }
  };

  const exportBackup = async () => {
    try {
      const result = await invoke<ExportResult>("export_company_backup");
      setStatusMessage(`${result.message} ${result.path}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const exportWorkspace = async () => {
    try {
      const result = await invoke<ExportResult>("export_workspace_markdown_zip");
      setStatusMessage(`${result.message} ${result.path}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const exportStaticSite = async () => {
    try {
      const result = await invoke<ExportResult>("export_static_site_zip");
      setStatusMessage(`${result.message} ${result.path}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const exportQcDeliverables = async () => {
    try {
      const result = await invoke<ExportResult>("export_qc_rated_deliverables_zip");
      setStatusMessage(`${result.message} ${result.path}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const refreshDeployStatus = async () => {
    try {
      const status = await invoke<DeployStatus>("get_deploy_status");
      setDeployStatus(status);
      setStatusMessage(status.message);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const pushToGithub = async () => {
    setDeployBusy(true);
    try {
      const result = await invoke<DeployResult>("push_static_site_to_github", {
        request: {
          repo_url: githubRepoUrl.trim() || null,
          repo_name: githubRepoName.trim() || null,
          private_repo: false,
        },
      });
      setStatusMessage(
        result.url ? `${result.message} ${result.url}` : `${result.message} ${result.path}`,
      );
      await refreshDeployStatus();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setDeployBusy(false);
    }
  };

  const pushToVercel = async () => {
    setDeployBusy(true);
    try {
      const result = await invoke<DeployResult>("push_static_site_to_vercel");
      setStatusMessage(
        result.url ? `${result.message} ${result.url}` : `${result.message} ${result.path}`,
      );
      await refreshDeployStatus();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setDeployBusy(false);
    }
  };

  const pushToNetlify = async () => {
    setDeployBusy(true);
    try {
      const result = await invoke<DeployResult>("push_static_site_to_netlify");
      setStatusMessage(
        result.url ? `${result.message} ${result.url}` : `${result.message} ${result.path}`,
      );
      await refreshDeployStatus();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setDeployBusy(false);
    }
  };

  const exportReport = async (command: string) => {
    try {
      const result = await invoke<ExportResult>(command);
      setStatusMessage(`${result.message} ${result.path}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const openExportsFolder = async () => {
    try {
      const result = await invoke<ExportResult>("open_exports_folder");
      setStatusMessage(result.message);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const importBackup = async () => {
    if (!restorePath.trim()) {
      setStatusMessage(t("settings.msg.backupPath"));
      return;
    }
    try {
      const result = await invoke<ExportResult>("import_company_backup", {
        path: restorePath.trim(),
      });
      await reloadGameState("import_backup");
      setStatusMessage(result.message);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const saveHubConfig = async () => {
    try {
      const next = await updateHubConfig({
        base_url: hubUrl.trim() || undefined,
        api_key: apiKey,
      });
      setHubStatus(next);
      setApiKey("");
      setStatusMessage(t("settings.msg.hubTesting"));
      await runHubProbe(true);
    } catch (error) {
      setStatusMessage(String(error));
      setHubProbeStatus("error");
      setHubProbe({
        ok: false,
        provider: "soulmd-hub",
        has_credentials: false,
        message: String(error),
      });
    }
  };

  return (
    <SettingsActiveSectionContext.Provider value={activeSection}>
    <div className="settings-panel settings-panel--page" ref={scrollRootRef}>
      <div className="settings-grid">
        <SettingsCard
          id="general"
          title={t("settings.section.general")}
          description={t("settings.card.generalDesc")}
        >
          <label className="field-label">
            {t("settings.language")}
            <select
              value={parseAppLanguage(settings.app_language)}
              onChange={(event) =>
                void updateSettings({ app_language: event.target.value })
              }
            >
              {APP_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ marginTop: 0 }}>
            {t("settings.language.help")}
          </p>
          <ul className="settings-info-list">
            <li>{t("settings.general.bullet1")}</li>
            <li>{t("settings.general.bullet2")}</li>
            <li>
              {t("settings.general.bullet3", {
                mins: settings.backup_interval_minutes ?? "—",
              })}
            </li>
            <li>{t("settings.general.bullet4")}</li>
          </ul>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.pure_local_mode}
              onChange={(event) =>
                void updateSettings({ pure_local_mode: event.target.checked })
              }
            />
            <span>{t("settings.pureLocal")}</span>
          </label>
          <label className="field-label">
            {t("settings.backupInterval")}
            <input
              type="number"
              min={0}
              max={1440}
              value={settings.backup_interval_minutes ?? 30}
              onChange={(event) =>
                void updateSettings({
                  backup_interval_minutes: Number(event.target.value),
                })
              }
            />
          </label>
          <div className="settings-update-row">
            <p className="muted">
              {t("settings.installedVersion")} <strong>v{appVersion}</strong>
            </p>
            <div className="settings-action-row">
              <button
                type="button"
                className="secondary-action"
                disabled={updateBusy}
                onClick={() => void checkAppUpdate()}
              >
                {t("settings.checkUpdates")}
              </button>
              {pendingUpdate ? (
                <button
                  type="button"
                  disabled={updateBusy}
                  onClick={() => void installAppUpdate()}
                >
                  Install v{pendingUpdate.version}
                </button>
              ) : null}
            </div>
            {updateProgress ? (
              <p className={`muted settings-update-status settings-update-status--${updateProgress.phase}`}>
                {updateProgress.message}
              </p>
            ) : null}
          </div>
        </SettingsCard>

        {showPlayModeSettings ? (
          <SettingsCard
            id="play"
            title={t("settings.card.play")}
            description={t("settings.card.playDesc")}
          >
            <PlayModePicker
              value={{
                playMode: settings.play_mode,
                randomEventsEnabled: settings.random_events_enabled,
                randomEventChance: settings.random_event_chance || DEFAULT_EVENT_CHANCE,
              }}
              onChange={(config: PlayModeConfig) => {
                void updateSettings({
                  play_mode: config.playMode,
                  random_events_enabled:
                    config.playMode === "game" && config.randomEventsEnabled,
                  random_event_chance: config.randomEventChance,
                });
              }}
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.god_mode_enabled}
                onChange={(event) =>
                  void updateSettings({ god_mode_enabled: event.target.checked })
                }
              />
              <span>{t("settings.enableGodMode")}</span>
            </label>
          </SettingsCard>
        ) : null}

        {showDisplaySettings ? (
        <SettingsCard
          id="display"
          title={t("settings.card.display")}
          description={t("settings.card.displayDesc")}
        >
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.pixel_filter_enabled}
              onChange={(event) =>
                void updateSettings({ pixel_filter_enabled: event.target.checked })
              }
            />
            <span>{t("settings.pixelFilter")}</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.crt_filter_enabled}
              onChange={(event) =>
                void updateSettings({ crt_filter_enabled: event.target.checked })
              }
            />
            <span>CRT filter (scanlines + cozy post FX)</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.low_power_mode}
              onChange={(event) =>
                void updateSettings({ low_power_mode: event.target.checked })
              }
            />
            <span>{t("settings.lowPower")}</span>
          </label>
        </SettingsCard>
        ) : null}

        {showAudioSettings ? (
        <SettingsCard
          id="audio"
          title={t("settings.card.audio")}
          description={t("settings.card.audioDesc")}
        >
          <div className="audio-settings-quick">
            <AudioMuteButton className="audio-mute-btn audio-mute-btn-settings" showLabel />
            <button
              type="button"
              className="secondary-action"
              onClick={() => void setAudioMuted(true)}
            >
              {t("settings.muteAll")}
            </button>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.music_enabled ?? true}
              onChange={(event) =>
                void patchAudioSettings({ music_enabled: event.target.checked })
              }
            />
            <span>{t("settings.music")}</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.sfx_enabled ?? true}
              onChange={(event) =>
                void patchAudioSettings({ sfx_enabled: event.target.checked })
              }
            />
            <span>{t("settings.sfx")}</span>
          </label>
          <label className="field-label">
            Music volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.music_volume ?? 0.25}
              onChange={(event) =>
                void patchAudioSettings({ music_volume: Number(event.target.value) })
              }
              disabled={!(settings.music_enabled ?? true)}
            />
            <span className="muted">{Math.round((settings.music_volume ?? 0.25) * 100)}%</span>
          </label>
          <label className="field-label">
            Sound effects volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfx_volume ?? 0.45}
              onChange={(event) =>
                void patchAudioSettings({ sfx_volume: Number(event.target.value) })
              }
              disabled={!(settings.sfx_enabled ?? true)}
            />
            <span className="muted">{Math.round((settings.sfx_volume ?? 0.45) * 100)}%</span>
          </label>
        </SettingsCard>
        ) : null}

        <SettingsCard
          id="cloud"
          title={t("settings.card.cloud")}
          description={t("settings.card.cloudDesc")}
        >
          <ProviderConnectionStatus
            status={hubProbeStatus}
            probe={hubProbe}
            busyDisabled={settings.pure_local_mode}
            onTest={() => void runHubProbe(true)}
            idleHint={t("settings.hubIdleHint")}
          />
          <label className="field-label">
            Hub base URL
            <input
              type="url"
              value={hubUrl}
              onChange={(event) => setHubUrl(event.target.value)}
              disabled={settings.pure_local_mode}
            />
          </label>
          <label className="field-label">
            API key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={t("settings.hubKeyPh")}
              disabled={settings.pure_local_mode}
            />
          </label>
          <div className="panel-actions stacked">
            <button type="button" onClick={() => void saveHubConfig()} disabled={settings.pure_local_mode}>
              {t("settings.saveHubCredentials")}
            </button>
          </div>
          <p className="muted">
            After save, the app live-tests hub with your key — green means accepted, red means failed.
          </p>
        </SettingsCard>

        <SettingsCard
          id="ai"
          title={t("settings.card.ai")}
          description={t("settings.card.aiDesc")}
        >
          <label className="field-label">
            Default company meeting brain
            <MeetingBrainPicker
              catalog={runtimeCatalog}
              value={meetingBrainValue}
              includeInherit={false}
              disabled={settings.pure_local_mode}
              onChange={(registryId) =>
                void updateSettings(
                  {
                    ai_provider: apiProviderIdForMeetingRegistry(registryId, runtimeCatalog),
                  },
                  { probeAfter: true },
                )
              }
            />
          </label>

          <ProviderConnectionStatus
            status={providerProbeStatus}
            probe={providerProbe}
            busyDisabled={settings.pure_local_mode}
            onTest={() => void runProviderProbe(true)}
            idleHint={t("settings.aiIdleHint")}
          />

          <p className="muted">
            API key / URL / model fields save when you leave the field (blur) — not on every keystroke —
            so the window stays responsive. After save, a live probe shows green (OK) or red (failed).
            Autopilot stays idle until the selected cloud provider has a working key.
          </p>

          <p className="muted">
            Company execution runtime (subprocess / OpenClaw / CLI) is configured in{" "}
            <button
              type="button"
              className="agents-inline-link"
              onClick={() => setActivePanel("agents")}
            >
              {t("settings.openAgentBrainsRuntime")}
            </button>
            . Per-agent overrides are also set there.
          </p>

          {(effectiveApiProvider === "ollama" || effectiveApiProvider === "mock") && (
            <>
              <label className="field-label">
                Ollama base URL
                <input
                  type="url"
                  value={draftOllamaUrl}
                  onChange={(event) => setDraftOllamaUrl(event.target.value)}
                  onBlur={() => {
                    if (draftOllamaUrl !== (settings.ollama_base_url ?? "")) {
                      void updateSettings({ ollama_base_url: draftOllamaUrl }, { probeAfter: true });
                    } else {
                      void runProviderProbe(false);
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Ollama model
                <input
                  type="text"
                  value={draftOllamaModel}
                  onChange={(event) => setDraftOllamaModel(event.target.value)}
                  onBlur={() => {
                    if (draftOllamaModel !== (settings.ollama_model ?? "")) {
                      void updateSettings({ ollama_model: draftOllamaModel }, { probeAfter: true });
                    } else {
                      void runProviderProbe(false);
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}

          {effectiveApiProvider === "openai" && (
            <>
              <label className="field-label">
                OpenAI base URL
                <input
                  type="url"
                  value={draftOpenaiUrl}
                  onChange={(event) => setDraftOpenaiUrl(event.target.value)}
                  onBlur={() => {
                    if (draftOpenaiUrl !== (settings.openai_base_url ?? "")) {
                      void updateSettings({ openai_base_url: draftOpenaiUrl }, { probeAfter: true });
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                OpenAI API key
                <input
                  type="password"
                  value={draftOpenaiKey}
                  onChange={(event) => setDraftOpenaiKey(event.target.value)}
                  onBlur={() => {
                    if (draftOpenaiKey !== (settings.openai_api_key ?? "")) {
                      void updateSettings({ openai_api_key: draftOpenaiKey }, { probeAfter: true });
                    } else {
                      void runProviderProbe(true);
                    }
                  }}
                  disabled={settings.pure_local_mode}
                  autoComplete="off"
                />
              </label>
              <label className="field-label">
                OpenAI model
                <input
                  type="text"
                  value={draftOpenaiModel}
                  onChange={(event) => setDraftOpenaiModel(event.target.value)}
                  onBlur={() => {
                    if (draftOpenaiModel !== (settings.openai_model ?? "")) {
                      void updateSettings({ openai_model: draftOpenaiModel }, { probeAfter: true });
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}

          {effectiveApiProvider === "grok" && (
            <>
              <label className="field-label">
                Grok base URL
                <input
                  type="url"
                  value={draftGrokUrl}
                  onChange={(event) => setDraftGrokUrl(event.target.value)}
                  onBlur={() => {
                    if (draftGrokUrl !== (settings.grok_base_url ?? "")) {
                      void updateSettings({ grok_base_url: draftGrokUrl }, { probeAfter: true });
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Grok API key
                <input
                  type="password"
                  value={draftGrokKey}
                  onChange={(event) => setDraftGrokKey(event.target.value)}
                  onBlur={() => {
                    if (draftGrokKey !== (settings.grok_api_key ?? "")) {
                      void updateSettings({ grok_api_key: draftGrokKey }, { probeAfter: true });
                    } else {
                      void runProviderProbe(true);
                    }
                  }}
                  disabled={settings.pure_local_mode}
                  autoComplete="off"
                />
              </label>
              <label className="field-label">
                Grok model
                <input
                  type="text"
                  value={draftGrokModel}
                  onChange={(event) => setDraftGrokModel(event.target.value)}
                  onBlur={() => {
                    if (draftGrokModel !== (settings.grok_model ?? "")) {
                      void updateSettings({ grok_model: draftGrokModel }, { probeAfter: true });
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}

          {effectiveApiProvider === "claude" && (
            <>
              <label className="field-label">
                Claude base URL
                <input
                  type="url"
                  value={draftClaudeUrl}
                  onChange={(event) => setDraftClaudeUrl(event.target.value)}
                  onBlur={() => {
                    if (draftClaudeUrl !== (settings.claude_base_url ?? "")) {
                      void updateSettings({ claude_base_url: draftClaudeUrl }, { probeAfter: true });
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Claude API key
                <input
                  type="password"
                  value={draftClaudeKey}
                  onChange={(event) => setDraftClaudeKey(event.target.value)}
                  onBlur={() => {
                    if (draftClaudeKey !== (settings.claude_api_key ?? "")) {
                      void updateSettings({ claude_api_key: draftClaudeKey }, { probeAfter: true });
                    } else {
                      void runProviderProbe(true);
                    }
                  }}
                  disabled={settings.pure_local_mode}
                  autoComplete="off"
                />
              </label>
              <label className="field-label">
                Claude model
                <input
                  type="text"
                  value={draftClaudeModel}
                  onChange={(event) => setDraftClaudeModel(event.target.value)}
                  onBlur={() => {
                    if (draftClaudeModel !== (settings.claude_model ?? "")) {
                      void updateSettings({ claude_model: draftClaudeModel }, { probeAfter: true });
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}

          {effectiveApiProvider === "deepseek" && (
            <>
              <label className="field-label">
                DeepSeek base URL
                <input
                  type="url"
                  value={draftDeepseekUrl}
                  onChange={(event) => setDraftDeepseekUrl(event.target.value)}
                  onBlur={() => {
                    if (draftDeepseekUrl !== (settings.deepseek_base_url ?? "")) {
                      void updateSettings(
                        { deepseek_base_url: draftDeepseekUrl },
                        { probeAfter: true },
                      );
                    }
                  }}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                DeepSeek API key
                <input
                  type="password"
                  value={draftDeepseekKey}
                  onChange={(event) => setDraftDeepseekKey(event.target.value)}
                  onBlur={() => {
                    if (draftDeepseekKey !== (settings.deepseek_api_key ?? "")) {
                      void updateSettings(
                        { deepseek_api_key: draftDeepseekKey },
                        { probeAfter: true },
                      );
                    } else {
                      void runProviderProbe(true);
                    }
                  }}
                  disabled={settings.pure_local_mode}
                  autoComplete="off"
                  placeholder={t("settings.aiKeyPh")}
                />
              </label>
              <label className="field-label">
                DeepSeek model
                <input
                  type="text"
                  value={draftDeepseekModel}
                  onChange={(event) => setDraftDeepseekModel(event.target.value)}
                  onBlur={() => {
                    if (draftDeepseekModel !== (settings.deepseek_model ?? "")) {
                      void updateSettings(
                        { deepseek_model: draftDeepseekModel },
                        { probeAfter: true },
                      );
                    }
                  }}
                  disabled={settings.pure_local_mode}
                  placeholder="deepseek-chat"
                />
              </label>
              <p className="muted">
                Paste your key and leave the field (blur) to save — the light turns green if the API
                accepts it, red if not.
              </p>
            </>
          )}
        </SettingsCard>

        <SettingsCard
          id="observatory"
          title={t("settings.card.observatory")}
          description={t("settings.card.observatoryDesc")}
        >
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.agent_activity_stream_enabled ?? true}
              onChange={(event) =>
                void updateSettings({ agent_activity_stream_enabled: event.target.checked })
              }
            />
            <span>{t("settings.liveStream")}</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.agent_activity_persist_stream ?? true}
              onChange={(event) =>
                void updateSettings({ agent_activity_persist_stream: event.target.checked })
              }
            />
            <span>{t("settings.persistStream")}</span>
          </label>
          <label className="field-label">
            Max activity events retained
            <input
              type="number"
              min={100}
              max={1000}
              value={settings.agent_activity_max_events ?? 500}
              onChange={(event) =>
                void updateSettings({
                  agent_activity_max_events: Number(event.target.value),
                })
              }
            />
          </label>
        </SettingsCard>

        <SettingsCard
          id="meetings"
          title={t("settings.card.meetings")}
          description={t("settings.card.meetingsDesc")}
        >
          <label className="field-label">
            Meeting turns per agent
            <input
              type="number"
              min={1}
              max={6}
              value={settings.meeting_turns_per_agent ?? 3}
              onChange={(event) =>
                void updateSettings({ meeting_turns_per_agent: Number(event.target.value) })
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.meeting_llm_fallback}
              onChange={(event) =>
                void updateSettings({ meeting_llm_fallback: event.target.checked })
              }
            />
            <span>{t("settings.meetingFallback")}</span>
          </label>

          <ProviderConnectionStatus
            status={providerProbeStatus}
            probe={providerProbe}
            busyDisabled={settings.pure_local_mode}
            onTest={() => {
              void (async () => {
                try {
                  const status = await invoke<MeetingAiStatus>("get_meeting_ai_status");
                  setStatusMessage(status.message);
                } catch (error) {
                  setStatusMessage(String(error));
                }
                await runProviderProbe(true);
              })();
            }}
            idleHint={t("settings.meetingIdleHint")}
          />
        </SettingsCard>

        <SettingsCard
          id="backup"
          title={t("settings.card.backup")}
          description={t("settings.card.backupDesc")}
          wide
        >
          <label className="field-label">
            Restore backup path
            <input
              type="text"
              value={restorePath}
              onChange={(event) => setRestorePath(event.target.value)}
              placeholder={t("settings.backupPathPh")}
            />
          </label>
          <div className="panel-actions stacked settings-export-actions">
            <button type="button" onClick={() => void exportBackup()}>
              Export Company Backup (JSON)
            </button>
            <button type="button" onClick={() => void exportReport("export_company_report_markdown")}>
              Export Company Report (Markdown)
            </button>
            <button type="button" onClick={() => void exportReport("export_company_report_html")}>
              Export Company Report (HTML)
            </button>
            <button type="button" onClick={() => void exportReport("export_company_report_pdf")}>
              Export Company Report (PDF)
            </button>
            <button type="button" onClick={() => void exportWorkspace()}>
              Export Workspace (Markdown ZIP)
            </button>
            <button type="button" className="primary-action" onClick={() => void exportStaticSite()}>
              Export Static Site (Deploy ZIP)
            </button>
            <button type="button" onClick={() => void exportQcDeliverables()}>
              Export QC-rated Deliverables (ZIP)
            </button>
            <button type="button" onClick={() => void openExportsFolder()}>
              {t("settings.openExportsFolder")}
            </button>
            <button type="button" onClick={() => void importBackup()}>
              {t("settings.importCompanyBackup")}
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          id="deploy"
          title={t("settings.card.deploy")}
          description={t("settings.card.deployDesc")}
          wide
        >
          {deployBusy && !deployStatus ? (
            <p className="muted">{t("settings.deployChecking")}</p>
          ) : null}
          {deployStatus ? (
            <div className="deploy-status-row">
              <span className={`deploy-pill ${deployStatus.git_available ? "ready" : "missing"}`}>
                {t("settings.deploy.git", {
                  status: deployStatus.git_available
                    ? t("settings.deploy.ready")
                    : t("settings.deploy.missing"),
                })}
              </span>
              <span className={`deploy-pill ${deployStatus.gh_authenticated ? "ready" : "missing"}`}>
                {t("settings.deploy.gh", {
                  status: deployStatus.gh_authenticated
                    ? t("settings.deploy.authenticated")
                    : t("settings.deploy.needsLogin"),
                })}
              </span>
              <span
                className={`deploy-pill ${deployStatus.vercel_cli_available ? "ready" : "missing"}`}
              >
                {t("settings.deploy.vercel", {
                  status: deployStatus.vercel_cli_available
                    ? t("settings.deploy.ready")
                    : t("settings.deploy.missing"),
                })}
              </span>
              <span
                className={`deploy-pill ${deployStatus.netlify_cli_available ? "ready" : "missing"}`}
              >
                {t("settings.deploy.netlify", {
                  status: deployStatus.netlify_cli_available
                    ? t("settings.deploy.ready")
                    : t("settings.deploy.missing"),
                })}
              </span>
            </div>
          ) : null}
          {deployStatus?.last_deploy_url ? (
            <p className="last-deploy-status muted">
              {t("settings.deploy.last", {
                provider: deployStatus.last_deploy_provider ?? t("settings.deploy.unknown"),
                url: deployStatus.last_deploy_url,
              })}
              {deployStatus.last_deploy_at
                ? ` · ${new Date(deployStatus.last_deploy_at).toLocaleString()}`
                : null}
            </p>
          ) : null}
          <label className="field-label">
            {t("settings.deploy.repoUrl")}
            <input
              type="url"
              value={githubRepoUrl}
              onChange={(event) => setGithubRepoUrl(event.target.value)}
              placeholder={t("settings.deployRepoPh")}
            />
          </label>
          <label className="field-label">
            {t("settings.deploy.repoName")}
            <input
              type="text"
              value={githubRepoName}
              onChange={(event) => setGithubRepoName(event.target.value)}
              placeholder={t("settings.deploySitePh")}
            />
          </label>
          <div className="panel-actions stacked">
            <button type="button" onClick={() => void refreshDeployStatus()}>
              {t("settings.deploy.refresh")}
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={deployBusy || !deployStatus?.git_available}
              onClick={() => void pushToGithub()}
            >
              {t("settings.deploy.pushGithub")}
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={deployBusy || !deployStatus?.vercel_cli_available}
              onClick={() => void pushToVercel()}
            >
              {t("settings.deploy.pushVercel")}
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={deployBusy || !deployStatus?.netlify_cli_available}
              onClick={() => void pushToNetlify()}
            >
              {t("settings.deploy.pushNetlify")}
            </button>
          </div>
        </SettingsCard>
      </div>
    </div>
    </SettingsActiveSectionContext.Provider>
  );
}