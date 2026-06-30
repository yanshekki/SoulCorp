import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { fetchSoulBalance, updateHubConfig } from "../../services/hubClient";
import { useGameStore } from "../../stores/gameStore";
import type {
  DeployResult,
  DeployStatus,
  EventMode,
  ExportResult,
  GameSettings,
  MeetingAiStatus,
} from "../../types/game";

export function SettingsPanel() {
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

  useEffect(() => {
    setHubUrl(hubStatus.base_url);
  }, [hubStatus.base_url]);

  useEffect(() => {
    void invoke<DeployStatus>("get_deploy_status")
      .then(setDeployStatus)
      .catch(() => setDeployStatus(null));
  }, []);

  const updateSettings = async (patch: Partial<GameSettings>) => {
    try {
      const next = await invoke<GameSettings>("update_game_settings", {
        update: {
          random_events_enabled: patch.random_events_enabled,
          event_mode: patch.event_mode,
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
          low_power_mode: patch.low_power_mode,
          backup_interval_minutes: patch.backup_interval_minutes,
        },
      });
      setSettings(next);
      setStatusMessage("Settings updated.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const exportBackup = async () => {
    const result = await invoke<ExportResult>("export_company_backup");
    setStatusMessage(`${result.message} ${result.path}`);
  };

  const exportWorkspace = async () => {
    const result = await invoke<ExportResult>("export_workspace_markdown_zip");
    setStatusMessage(`${result.message} ${result.path}`);
  };

  const exportStaticSite = async () => {
    const result = await invoke<ExportResult>("export_static_site_zip");
    setStatusMessage(`${result.message} ${result.path}`);
  };

  const exportQcDeliverables = async () => {
    const result = await invoke<ExportResult>("export_qc_rated_deliverables_zip");
    setStatusMessage(`${result.message} ${result.path}`);
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
    const result = await invoke<ExportResult>(command);
    setStatusMessage(`${result.message} ${result.path}`);
  };

  const openExportsFolder = async () => {
    const result = await invoke<ExportResult>("open_exports_folder");
    setStatusMessage(result.message);
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
    <section className="panel-card settings-panel">
      <h2>Settings</h2>

      <div className="offline-capabilities">
        <h3>Offline capabilities</h3>
        <ul>
          <li>Simulation, meetings, and workspace run without network access.</li>
          <li>Pure Local Mode disables hub sync and marketplace calls.</li>
          <li>
            Auto-backup writes to the local exports folder every{" "}
            {settings.backup_interval_minutes || "—"} minutes.
          </li>
          <li>Low power mode uses map view and slower simulation ticks.</li>
        </ul>
      </div>

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

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.random_events_enabled}
          onChange={(event) =>
            void updateSettings({ random_events_enabled: event.target.checked })
          }
        />
        <span>Enable Random Events & Drama</span>
      </label>

      <label className="field-label">
        Event mode
        <select
          value={settings.event_mode}
          onChange={(event) =>
            void updateSettings({ event_mode: event.target.value as EventMode })
          }
        >
          <option value="fun">Fun Mode</option>
          <option value="balanced">Balanced Mode</option>
          <option value="serious">Serious Work Mode</option>
        </select>
      </label>

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

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.pixel_filter_enabled}
          onChange={(event) =>
            void updateSettings({ pixel_filter_enabled: event.target.checked })
          }
        />
        <span>Pixel filter (cozy retro look)</span>
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

      <label className="field-label">
        Auto-backup interval (minutes, 0 = off)
        <input
          type="number"
          min={0}
          max={1440}
          value={settings.backup_interval_minutes}
          onChange={(event) =>
            void updateSettings({
              backup_interval_minutes: Number(event.target.value),
            })
          }
        />
      </label>

      <div className="settings-section">
        <h3>soulmd-hub Connection</h3>
        <p className="muted">
          Optional cloud sync and marketplace. Disabled automatically in Pure Local Mode.
        </p>
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
      </div>

      <label className="field-label">
        AI Provider
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

      <label className="field-label">
        Meeting turns per agent
        <input
          type="number"
          min={1}
          max={6}
          value={settings.meeting_turns_per_agent}
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

      <div className="settings-section deploy-section">
        <h3>One-click deploy</h3>
        <p className="muted">
          Push your exported static site to GitHub or Vercel. Requires git, GitHub CLI (gh), and
          Node.js/npx on your machine.
        </p>
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
      </div>

      <label className="field-label">
        Restore backup path
        <input
          type="text"
          value={restorePath}
          onChange={(event) => setRestorePath(event.target.value)}
          placeholder="/path/to/soulcorp-backup.json"
        />
      </label>

      <div className="panel-actions stacked">
        <button type="button" onClick={() => void exportBackup()}>
          Export Company Backup (JSON)
        </button>
        <button
          type="button"
          onClick={() => void exportReport("export_company_report_markdown")}
        >
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
    </section>
  );
}