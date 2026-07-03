import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { patchAudioSettings, setAudioMuted } from "../../hooks/useAudioSettings";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { AudioMuteButton } from "./AudioMuteButton";
import { fetchSoulBalance, updateHubConfig } from "../../services/hubClient";
import { useCompanyScope } from "../../hooks/useCompanyScope";
import { useGameStore } from "../../stores/gameStore";
import { DEFAULT_EVENT_CHANCE } from "../../data/playModeOptions";
import {
  showAudioSettings,
  showDisplaySettings,
  showPlayModeSettings,
} from "../../config/features";
import { PlayModePicker, type PlayModeConfig } from "./PlayModePicker";
import type {
  DeployResult,
  DeployStatus,
  ExportResult,
  GameSettings,
  MeetingAiStatus,
} from "../../types/game";

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
  onSectionFocus?: (sectionId: string) => void;
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

export function SettingsPanel({ onSectionFocus }: SettingsPanelProps) {
  const { activeCompanyId, companyRevision } = useCompanyScope();
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const setSettings = useGameStore((state) => state.setSettings);
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [hubUrl, setHubUrl] = useState(hubStatus.base_url);
  const [apiKey, setApiKey] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null);
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [githubRepoName, setGithubRepoName] = useState("");
  const [deployBusy, setDeployBusy] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHubUrl(hubStatus.base_url);
  }, [hubStatus.base_url]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    void invoke<GameSettings>("get_game_settings")
      .then(setSettings)
      .catch((error) => setStatusMessage(String(error)));
  }, [activeCompanyId, companyRevision, setSettings, setStatusMessage]);

  const deployStatusRequestedRef = useRef(false);

  useEffect(() => {
    if (!onSectionFocus) {
      return;
    }
    const root = scrollRootRef.current?.closest(".settings-page-scroll");
    const sections = scrollRootRef.current?.querySelectorAll("[data-settings-section]");
    if (!root || !sections?.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-settings-section");
        if (sectionId) {
          onSectionFocus(sectionId);
        }
        if (
          !deployStatusRequestedRef.current &&
          entries.some(
            (entry) =>
              entry.isIntersecting &&
              entry.target.getAttribute("data-settings-section") === "deploy",
          )
        ) {
          deployStatusRequestedRef.current = true;
          void invoke<DeployStatus>("get_deploy_status")
            .then(setDeployStatus)
            .catch(() => setDeployStatus(null));
        }
      },
      { root, rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onSectionFocus]);

  const updateSettings = async (patch: Partial<GameSettings>) => {
    try {
      const next = await invoke<GameSettings>("update_game_settings", {
        update: {
          play_mode: patch.play_mode,
          random_events_enabled: patch.random_events_enabled,
          random_event_chance: patch.random_event_chance,
          god_mode_enabled: patch.god_mode_enabled,
          ai_provider: patch.ai_provider,
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
      setStatusMessage("Settings updated.");
    } catch (error) {
      setStatusMessage(String(error));
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
      setStatusMessage("Enter the full path to a company backup JSON file.");
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
      setStatusMessage("Hub credentials updated.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const refreshSoulBalance = async () => {
    try {
      const next = await fetchSoulBalance();
      setHubStatus(next);
      setStatusMessage(`$SOUL balance: ${next.soul_balance.toFixed(2)} (${next.user_tier})`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="settings-panel settings-panel--page" ref={scrollRootRef}>
      <div className="settings-grid">
        <SettingsCard
          id="general"
          title="General"
          description="Offline-first simulation. Pure Local Mode disables all cloud calls."
        >
          <ul className="settings-info-list">
            <li>Simulation, meetings, and workspace run without network access.</li>
            <li>Pure Local Mode disables hub sync and marketplace calls.</li>
            <li>
              Auto-backup writes to the local exports folder every{" "}
              {settings.backup_interval_minutes ?? "—"} minutes.
            </li>
            <li>Low power mode uses map view and slower simulation ticks.</li>
          </ul>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.pure_local_mode}
              onChange={(event) =>
                void updateSettings({ pure_local_mode: event.target.checked })
              }
            />
            <span>Pure Local Mode (zero cloud)</span>
          </label>
          <label className="field-label">
            Auto-backup interval (minutes, 0 = off)
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
        </SettingsCard>

        {showPlayModeSettings ? (
          <SettingsCard id="play" title="Play mode" description="Work vs game simulation and Fate events.">
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
              <span>Enable God Mode</span>
            </label>
          </SettingsCard>
        ) : null}

        {showDisplaySettings ? (
        <SettingsCard
          id="display"
          title="Display & performance"
          description="Visual filters and FPS-friendly options for older hardware."
        >
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.pixel_filter_enabled}
              onChange={(event) =>
                void updateSettings({ pixel_filter_enabled: event.target.checked })
              }
            />
            <span>Pixel filter (pixel agents + retro look)</span>
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
            <span>Low power mode (better FPS)</span>
          </label>
        </SettingsCard>
        ) : null}

        {showAudioSettings ? (
        <SettingsCard id="audio" title="Audio" description="Music, SFX, and quick mute controls.">
          <div className="audio-settings-quick">
            <AudioMuteButton className="audio-mute-btn audio-mute-btn-settings" showLabel />
            <button
              type="button"
              className="secondary-action"
              onClick={() => void setAudioMuted(true)}
            >
              Mute all
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
            <span>Background music</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.sfx_enabled ?? true}
              onChange={(event) =>
                void patchAudioSettings({ sfx_enabled: event.target.checked })
              }
            />
            <span>Sound effects</span>
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
          title="soulmd-hub connection"
          description="Optional cloud sync and marketplace. Disabled in Pure Local Mode."
        >
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
              placeholder="Paste hub API key"
              disabled={settings.pure_local_mode}
            />
          </label>
          <div className="panel-actions stacked">
            <button type="button" onClick={() => void saveHubConfig()} disabled={settings.pure_local_mode}>
              Save hub credentials
            </button>
            <button type="button" onClick={() => void refreshSoulBalance()} disabled={settings.pure_local_mode}>
              Refresh $SOUL balance
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          id="ai"
          title="AI providers"
          description="Default LLM for company agents and meetings."
        >
          <label className="field-label">
            Default company AI provider
            <select
              value={settings.ai_provider}
              onChange={(event) => void updateSettings({ ai_provider: event.target.value })}
              disabled={settings.pure_local_mode}
            >
              <option value="mock">Mock (offline)</option>
              <option value="ollama">Ollama (local)</option>
              <option value="openai">OpenAI-compatible</option>
              <option value="grok">Grok (xAI)</option>
              <option value="claude">Claude-compatible</option>
              <option value="soulmd-hub">soulmd-hub API</option>
            </select>
          </label>

          {(settings.ai_provider === "ollama" || settings.ai_provider === "mock") && (
            <>
              <label className="field-label">
                Ollama base URL
                <input
                  type="url"
                  value={settings.ollama_base_url}
                  onChange={(event) => void updateSettings({ ollama_base_url: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Ollama model
                <input
                  type="text"
                  value={settings.ollama_model}
                  onChange={(event) => void updateSettings({ ollama_model: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}

          {settings.ai_provider === "openai" && (
            <>
              <label className="field-label">
                OpenAI base URL
                <input
                  type="url"
                  value={settings.openai_base_url}
                  onChange={(event) => void updateSettings({ openai_base_url: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                OpenAI API key
                <input
                  type="password"
                  value={settings.openai_api_key}
                  onChange={(event) => void updateSettings({ openai_api_key: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                OpenAI model
                <input
                  type="text"
                  value={settings.openai_model}
                  onChange={(event) => void updateSettings({ openai_model: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}

          {settings.ai_provider === "grok" && (
            <>
              <label className="field-label">
                Grok base URL
                <input
                  type="url"
                  value={settings.grok_base_url}
                  onChange={(event) => void updateSettings({ grok_base_url: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Grok API key
                <input
                  type="password"
                  value={settings.grok_api_key}
                  onChange={(event) => void updateSettings({ grok_api_key: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Grok model
                <input
                  type="text"
                  value={settings.grok_model}
                  onChange={(event) => void updateSettings({ grok_model: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}

          {settings.ai_provider === "claude" && (
            <>
              <label className="field-label">
                Claude base URL
                <input
                  type="url"
                  value={settings.claude_base_url}
                  onChange={(event) => void updateSettings({ claude_base_url: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Claude API key
                <input
                  type="password"
                  value={settings.claude_api_key}
                  onChange={(event) => void updateSettings({ claude_api_key: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
              <label className="field-label">
                Claude model
                <input
                  type="text"
                  value={settings.claude_model}
                  onChange={(event) => void updateSettings({ claude_model: event.target.value })}
                  disabled={settings.pure_local_mode}
                />
              </label>
            </>
          )}
        </SettingsCard>

        <SettingsCard id="meetings" title="Meetings" description="Turn limits and LLM fallback behavior.">
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
            <span>Fall back to mock dialogue if live LLM fails</span>
          </label>
          <div className="panel-actions">
            <button
              type="button"
              onClick={async () => {
                try {
                  const status = await invoke<MeetingAiStatus>("get_meeting_ai_status");
                  setStatusMessage(status.message);
                } catch (error) {
                  setStatusMessage(String(error));
                }
              }}
            >
              Test meeting AI connection
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          id="backup"
          title="Backup & export"
          description="Company backups, workspace exports, and restore."
          wide
        >
          <label className="field-label">
            Restore backup path
            <input
              type="text"
              value={restorePath}
              onChange={(event) => setRestorePath(event.target.value)}
              placeholder="/path/to/soulcorp-backup.json"
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
              Open Exports Folder
            </button>
            <button type="button" onClick={() => void importBackup()}>
              Import Company Backup
            </button>
          </div>
        </SettingsCard>

        <SettingsCard
          id="deploy"
          title="One-click deploy"
          description="Push your exported static site to GitHub, Vercel, or Netlify."
          wide
        >
          {deployStatus ? (
            <div className="deploy-status-row">
              <span className={`deploy-pill ${deployStatus.git_available ? "ready" : "missing"}`}>
                git {deployStatus.git_available ? "ready" : "missing"}
              </span>
              <span className={`deploy-pill ${deployStatus.gh_authenticated ? "ready" : "missing"}`}>
                gh {deployStatus.gh_authenticated ? "authenticated" : "needs login"}
              </span>
              <span
                className={`deploy-pill ${deployStatus.vercel_cli_available ? "ready" : "missing"}`}
              >
                vercel {deployStatus.vercel_cli_available ? "ready" : "missing"}
              </span>
              <span
                className={`deploy-pill ${deployStatus.netlify_cli_available ? "ready" : "missing"}`}
              >
                netlify {deployStatus.netlify_cli_available ? "ready" : "missing"}
              </span>
            </div>
          ) : null}
          {deployStatus?.last_deploy_url ? (
            <p className="last-deploy-status muted">
              Last deploy ({deployStatus.last_deploy_provider ?? "unknown"}):{" "}
              {deployStatus.last_deploy_url}
              {deployStatus.last_deploy_at
                ? ` · ${new Date(deployStatus.last_deploy_at).toLocaleString()}`
                : null}
            </p>
          ) : null}
          <label className="field-label">
            GitHub repo URL (optional — leave blank to create via gh)
            <input
              type="url"
              value={githubRepoUrl}
              onChange={(event) => setGithubRepoUrl(event.target.value)}
              placeholder="https://github.com/you/soulcorp-site.git"
            />
          </label>
          <label className="field-label">
            New repo name (when creating with gh)
            <input
              type="text"
              value={githubRepoName}
              onChange={(event) => setGithubRepoName(event.target.value)}
              placeholder="soulcorp-company-site"
            />
          </label>
          <div className="panel-actions stacked">
            <button type="button" onClick={() => void refreshDeployStatus()}>
              Refresh deploy tooling
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={deployBusy || !deployStatus?.git_available}
              onClick={() => void pushToGithub()}
            >
              Push to GitHub
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={deployBusy || !deployStatus?.vercel_cli_available}
              onClick={() => void pushToVercel()}
            >
              Push to Vercel
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={deployBusy || !deployStatus?.netlify_cli_available}
              onClick={() => void pushToNetlify()}
            >
              Push to Netlify
            </button>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}