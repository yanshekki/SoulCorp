import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentRuntimeStatus,
  AgentRuntimeTestResult,
  GameSettings,
  RuntimeCatalog,
  RuntimeCatalogEntry,
  RuntimeProbeSummary,
} from "../../../types/game";
import {
  filterCatalogByLayer,
  groupCatalogEntries,
  isSubprocessRuntime,
  runtimeBinaryPlaceholder,
} from "../../../utils/agentRuntimeCatalog";

interface AgentRuntimeSectionProps {
  settings: GameSettings;
  onPersist: (patch: Partial<GameSettings>) => Promise<void>;
  onStatusMessage: (message: string) => void;
}

export function AgentRuntimeSection({
  settings,
  onPersist,
  onStatusMessage,
}: AgentRuntimeSectionProps) {
  const [catalog, setCatalog] = useState<RuntimeCatalog | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<AgentRuntimeStatus | null>(null);
  const [installedSummary, setInstalledSummary] = useState<RuntimeProbeSummary[]>([]);
  const [testing, setTesting] = useState(false);

  const activeMode = settings.agent_runtime_mode ?? "llm_only";
  const subprocessSelected = isSubprocessRuntime(activeMode);

  const activeEntry = useMemo(
    () => catalog?.runtimes.find((entry) => entry.id === activeMode) ?? null,
    [catalog, activeMode],
  );

  const loadRuntimeData = useCallback(async () => {
    try {
      const [cat, status, probes] = await Promise.all([
        invoke<RuntimeCatalog>("get_agent_runtime_catalog"),
        invoke<AgentRuntimeStatus>("get_agent_runtime_status"),
        invoke<RuntimeProbeSummary[]>("probe_all_agent_runtimes"),
      ]);
      setCatalog(cat);
      setRuntimeStatus(status);
      setInstalledSummary(probes);
    } catch {
      setCatalog(null);
      setRuntimeStatus(null);
      setInstalledSummary([]);
    }
  }, []);

  useEffect(() => {
    void loadRuntimeData();
  }, [loadRuntimeData, activeMode]);

  const grouped = useMemo(
    () =>
      catalog ? groupCatalogEntries(filterCatalogByLayer(catalog, "execution")) : [],
    [catalog],
  );

  const showClawOptions = activeEntry?.adapter === "claw_agent_cli";
  const isCustom = activeMode === "custom";

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await invoke<AgentRuntimeTestResult>("test_agent_runtime", { request: {} });
      onStatusMessage(result.message);
      await loadRuntimeData();
    } catch (error) {
      onStatusMessage(String(error));
    } finally {
      setTesting(false);
    }
  };

  const installedForActive = installedSummary.find((item) => item.runtime_id === activeMode);

  return (
    <div className="command-form">
      <label className="field-label">
        Runtime mode
        <select
          value={activeMode}
          onChange={(e) => void onPersist({ agent_runtime_mode: e.target.value })}
        >
          {grouped.map((group) => (
            <optgroup key={group.category} label={group.label}>
              {group.runtimes.map((entry: RuntimeCatalogEntry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id === "llm_only" ? entry.label : `${entry.label} subprocess`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {subprocessSelected && runtimeStatus ? (
        <div className="command-runtime-status-card command-panel-block">
          <p className="command-runtime-status-line">
            <strong>{runtimeStatus.runtime_label}</strong>
            <span className={runtimeStatus.binary_available ? "command-runtime-badge--ok" : "command-runtime-badge--warn"}>
              {runtimeStatus.binary_available ? "Detected" : "Missing"}
            </span>
            {runtimeStatus.agent_command_available ? (
              <span className="command-runtime-badge--ok">CLI ok</span>
            ) : null}
            {runtimeStatus.gateway_healthy ? (
              <span className="command-runtime-badge--ok">Gateway</span>
            ) : null}
          </p>
          <p className="command-form-note">{runtimeStatus.message}</p>
          {activeEntry?.docs_url ? (
            <p className="command-form-note">
              Docs:{" "}
              <a href={activeEntry.docs_url} target="_blank" rel="noreferrer">
                {activeEntry.docs_url}
              </a>
            </p>
          ) : null}
          {installedForActive && !installedForActive.binary_available ? (
            <p className="command-form-note">Install `{activeEntry?.default_binary || activeMode}` or set a binary path below.</p>
          ) : null}
        </div>
      ) : null}

      {subprocessSelected ? (
        <>
          {isCustom ? (
            <>
              <label className="field-label">
                Custom binary path
                <input
                  type="text"
                  value={settings.agent_runtime_custom_binary ?? ""}
                  placeholder="/usr/local/bin/my-agent"
                  onChange={(e) => void onPersist({ agent_runtime_custom_binary: e.target.value })}
                />
              </label>
              <label className="field-label">
                Adapter family
                <select
                  value={settings.agent_runtime_custom_adapter ?? "legacy_stdin"}
                  onChange={(e) => void onPersist({ agent_runtime_custom_adapter: e.target.value })}
                >
                  {(catalog?.adapters ?? []).map((adapter) => (
                    <option key={adapter.id} value={adapter.id}>
                      {adapter.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="field-label">
              {runtimeStatus?.runtime_label ?? "Runtime"} binary path
              <input
                type="text"
                value={settings.openclaw_binary_path ?? ""}
                placeholder={runtimeBinaryPlaceholder(activeEntry?.id, activeEntry?.default_binary)}
                onChange={(e) => void onPersist({ openclaw_binary_path: e.target.value })}
              />
            </label>
          )}

          {showClawOptions ? (
            <label className="field-label">
              Default agent id
              <input
                type="text"
                value={settings.openclaw_default_agent_id ?? "main"}
                placeholder="main"
                onChange={(e) => void onPersist({ openclaw_default_agent_id: e.target.value })}
              />
            </label>
          ) : null}

          <label className="field-label">
            Timeout (seconds)
            <input
              type="number"
              min={30}
              max={3600}
              value={settings.openclaw_timeout_secs ?? 600}
              onChange={(e) => void onPersist({ openclaw_timeout_secs: Number(e.target.value) })}
            />
          </label>

          {showClawOptions ? (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.openclaw_use_local ?? true}
                  onChange={(e) => void onPersist({ openclaw_use_local: e.target.checked })}
                />
                <span>Run embedded locally (`{activeEntry?.default_binary ?? "agent"} agent --local`)</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.openclaw_prefer_gateway ?? false}
                  onChange={(e) => void onPersist({ openclaw_prefer_gateway: e.target.checked })}
                />
                <span>Prefer gateway when healthy (omit --local)</span>
              </label>
            </>
          ) : null}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.agent_runtime_fallback_to_llm ?? true}
              onChange={(e) => void onPersist({ agent_runtime_fallback_to_llm: e.target.checked })}
            />
            <span>Fallback to in-app LLM if subprocess fails</span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.agent_runtime_allow_cli_env_keys ?? false}
              onChange={(e) => void onPersist({ agent_runtime_allow_cli_env_keys: e.target.checked })}
            />
            <span>Allow CLI to read stored API keys (e.g. XAI_API_KEY for Grok)</span>
          </label>

          <button type="button" className="btn" disabled={testing} onClick={() => void handleTest()}>
            {testing ? `Testing ${runtimeStatus?.runtime_label ?? "runtime"}…` : `Test ${runtimeStatus?.runtime_label ?? "runtime"}`}
          </button>
        </>
      ) : null}

      {installedSummary.length > 0 ? (
        <details className="command-runtime-installed">
          <summary>Installed runtimes on this machine ({installedSummary.filter((i) => i.binary_available).length})</summary>
          <ul className="command-runtime-installed-list">
            {installedSummary.map((item) => (
              <li key={item.runtime_id} className={item.binary_available ? "is-available" : ""}>
                <strong>{item.runtime_label}</strong>
                <span>{item.binary_available ? "installed" : "not found"}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}