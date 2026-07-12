import { invoke } from "../../../utils/tauriInvoke";
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
import { useI18n } from "../../../i18n/I18nProvider";

interface AgentRuntimeSectionProps {
  settings: GameSettings;
  onPersist: (patch: Partial<GameSettings>) => Promise<void>;
  onStatusMessage: (message: string) => void;
}

type ProbeLight = "idle" | "checking" | "ok" | "error";

function lightTitle(
  status: ProbeLight,
  runtimeLabel: string,
  t: (key: string, params?: Record<string, string | number | undefined | null>) => string,
): string {
  switch (status) {
    case "checking":
      return t("runtime.light.testing", { label: runtimeLabel });
    case "ok":
      return t("runtime.light.connected", { label: runtimeLabel });
    case "error":
      return t("runtime.light.failed", { label: runtimeLabel });
    default:
      return t("runtime.light.idle", { label: runtimeLabel });
  }
}

function StatusDot({
  state,
  label,
}: {
  state: "ok" | "error" | "warn" | "idle";
  label: string;
}) {
  return (
    <span className={`runtime-status-dot runtime-status-dot--${state}`} title={label}>
      <span className="runtime-status-dot-light" aria-hidden="true" />
      <span className="runtime-status-dot-label">{label}</span>
    </span>
  );
}

export function AgentRuntimeSection({
  settings,
  onPersist,
  onStatusMessage,
}: AgentRuntimeSectionProps) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<RuntimeCatalog | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<AgentRuntimeStatus | null>(null);
  const [installedSummary, setInstalledSummary] = useState<RuntimeProbeSummary[]>([]);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<ProbeLight>("idle");
  const [testResult, setTestResult] = useState<AgentRuntimeTestResult | null>(null);

  const activeMode = settings.agent_runtime_mode ?? "llm_only";
  const subprocessSelected = isSubprocessRuntime(activeMode);
  const runtimeLabel = runtimeStatus?.runtime_label ?? "runtime";

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
    // Reset live test light when switching runtime mode.
    setTestStatus("idle");
    setTestResult(null);
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
    setTestStatus("checking");
    setTestResult(null);
    onStatusMessage(`Testing ${runtimeLabel}…`);
    try {
      const result = await invoke<AgentRuntimeTestResult>("test_agent_runtime", { request: {} });
      setTestResult(result);
      setTestStatus(result.ok ? "ok" : "error");
      onStatusMessage(result.message);
      await loadRuntimeData();
    } catch (error) {
      const msg = String(error);
      setTestResult({
        ok: false,
        transport: null,
        preview: "",
        message: msg,
        duration_ms: 0,
      });
      setTestStatus("error");
      onStatusMessage(msg);
    } finally {
      setTesting(false);
    }
  };

  const installedForActive = installedSummary.find((item) => item.runtime_id === activeMode);
  const binaryOk = Boolean(runtimeStatus?.binary_available);
  const cliOk = Boolean(runtimeStatus?.agent_command_available);
  const gatewayOk = Boolean(runtimeStatus?.gateway_healthy);

  const testMessage =
    testStatus === "checking"
      ? t("runtime.testRunning")
      : testResult?.message
        ?? t("runtime.testIdle");

  return (
    <div className="command-form">
      <label className="field-label">
        {t("runtime.mode")}
        <select
          value={activeMode}
          onChange={(e) => void onPersist({ agent_runtime_mode: e.target.value })}
        >
          {grouped.map((group) => (
            <optgroup key={group.category} label={group.label}>
              {group.runtimes.map((entry: RuntimeCatalogEntry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.id === "llm_only" ? entry.label : t("runtime.subprocessSuffix", { label: entry.label })}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {subprocessSelected && runtimeStatus ? (
        <div
          className={`runtime-probe-card ${binaryOk ? "runtime-probe-card--ok" : "runtime-probe-card--error"}`}
          role="status"
        >
          <div className="runtime-probe-card-header">
            <span
              className={`provider-status-light ${
                binaryOk ? "provider-status-light--ok" : "provider-status-light--error"
              }`}
              aria-hidden="true"
            />
            <div className="runtime-probe-card-titles">
              <strong>{runtimeStatus.runtime_label}</strong>
              <p className="muted runtime-probe-card-msg">{runtimeStatus.message}</p>
            </div>
          </div>
          <div className="runtime-probe-dots" aria-label={t("runtime.healthAria")}>
            <StatusDot
              state={binaryOk ? "ok" : "error"}
              label={binaryOk ? t("runtime.binaryOk") : t("runtime.binaryMissing")}
            />
            <StatusDot
              state={cliOk ? "ok" : binaryOk ? "warn" : "idle"}
              label={cliOk ? t("runtime.cliReady") : t("runtime.cliUnverified")}
            />
            {showClawOptions ? (
              <StatusDot
                state={gatewayOk ? "ok" : "idle"}
                label={gatewayOk ? t("runtime.gatewayOk") : t("runtime.gatewayOff")}
              />
            ) : null}
          </div>
          {activeEntry?.docs_url ? (
            <p className="command-form-note runtime-probe-docs">
              {t("runtime.docs")}{" "}
              <a href={activeEntry.docs_url} target="_blank" rel="noreferrer">
                {activeEntry.docs_url}
              </a>
            </p>
          ) : null}
          {installedForActive && !installedForActive.binary_available ? (
            <p className="command-form-note">
              {t("runtime.installHint", { binary: activeEntry?.default_binary || activeMode })}
            </p>
          ) : null}
        </div>
      ) : null}

      {subprocessSelected ? (
        <>
          {isCustom ? (
            <>
              <label className="field-label">
                {t("runtime.customBinary")}
                <input
                  type="text"
                  value={settings.agent_runtime_custom_binary ?? ""}
                  placeholder="/usr/local/bin/my-agent"
                  onChange={(e) => void onPersist({ agent_runtime_custom_binary: e.target.value })}
                />
              </label>
              <label className="field-label">
                {t("runtime.adapterFamily")}
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
              {t("runtime.binaryPath", { label: runtimeStatus?.runtime_label ?? "Runtime" })}
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
              {t("runtime.defaultAgentId")}
              <input
                type="text"
                value={settings.openclaw_default_agent_id ?? "main"}
                placeholder="main"
                onChange={(e) => void onPersist({ openclaw_default_agent_id: e.target.value })}
              />
            </label>
          ) : null}

          <label className="field-label">
            {t("runtime.timeout")}
            <input
              type="number"
              min={30}
              max={3600}
              value={settings.openclaw_timeout_secs ?? 3600}
              onChange={(e) =>
                void onPersist({
                  openclaw_timeout_secs: Math.min(3600, Math.max(30, Number(e.target.value) || 3600)),
                })
              }
            />
          </label>
          <p className="muted command-form-note">{t("runtime.cwdNote")}</p>

          {showClawOptions ? (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.openclaw_use_local ?? true}
                  onChange={(e) => void onPersist({ openclaw_use_local: e.target.checked })}
                />
                <span>{t("runtime.runLocal", { binary: activeEntry?.default_binary ?? "agent" })}</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.openclaw_prefer_gateway ?? false}
                  onChange={(e) => void onPersist({ openclaw_prefer_gateway: e.target.checked })}
                />
                <span>{t("runtime.preferGateway")}</span>
              </label>
            </>
          ) : null}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.agent_runtime_fallback_to_llm ?? true}
              onChange={(e) => void onPersist({ agent_runtime_fallback_to_llm: e.target.checked })}
            />
            <span>{t("runtime.fallbackLlm")}</span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.agent_runtime_allow_cli_env_keys ?? false}
              onChange={(e) => void onPersist({ agent_runtime_allow_cli_env_keys: e.target.checked })}
            />
            <span>{t("runtime.allowCliKeys")}</span>
          </label>

          {/* Green / red light test panel — same language as Settings → AI providers */}
          <div
            className={`provider-status provider-status--${testStatus} runtime-test-status`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`provider-status-light provider-status-light--${testStatus}`}
              aria-hidden="true"
            />
            <div className="provider-status-body">
              <strong className="provider-status-title">
                {lightTitle(testStatus, runtimeLabel, t)}
              </strong>
              <p className="provider-status-message muted">{testMessage}</p>
              {testStatus === "ok" && testResult ? (
                <div className="runtime-test-meta">
                  {testResult.transport ? (
                    <span className="hub-pill online">
                      {t("runtime.via", {
                        transport: t(
                          testResult.transport === "api"
                            ? "transport.api"
                            : testResult.transport === "subprocess"
                              ? "transport.subprocess"
                              : testResult.transport === "builtin"
                                ? "transport.builtin"
                                : "transport.builtin",
                        ),
                      })}
                    </span>
                  ) : null}
                  {(testResult.duration_ms ?? 0) > 0 ? (
                    <span className="hub-pill tier">{testResult.duration_ms} ms</span>
                  ) : null}
                  <span className="hub-pill online">{t("runtime.pass")}</span>
                </div>
              ) : null}
              {testStatus === "error" ? (
                <div className="runtime-test-meta">
                  <span className="hub-pill offline">{t("runtime.fail")}</span>
                </div>
              ) : null}
              {testStatus === "ok" && testResult?.preview ? (
                <pre className="runtime-test-preview" tabIndex={0}>
                  {testResult.preview}
                </pre>
              ) : null}
            </div>
            <button
              type="button"
              className={testStatus === "ok" ? "secondary-action" : "primary-action"}
              disabled={testing}
              onClick={() => void handleTest()}
            >
              {testing
                ? t("runtime.testing")
                : testStatus === "idle"
                  ? t("runtime.testBtn", { label: runtimeLabel })
                  : t("runtime.retestBtn", { label: runtimeLabel })}
            </button>
          </div>

          {activeMode === "grok" && !(settings.agent_runtime_allow_cli_env_keys ?? false) ? (
            <p className="muted command-form-note">{t("runtime.grokKeyHint")}</p>
          ) : null}
        </>
      ) : null}

      {installedSummary.length > 0 ? (
        <details className="command-runtime-installed">
          <summary>
            Installed runtimes on this machine (
            {installedSummary.filter((i) => i.binary_available).length})
          </summary>
          <ul className="command-runtime-installed-list">
            {installedSummary.map((item) => (
              <li
                key={item.runtime_id}
                className={item.binary_available ? "is-available" : "is-missing"}
              >
                <span
                  className={`runtime-status-dot-light runtime-status-dot-light--inline ${
                    item.binary_available
                      ? "provider-status-light--ok"
                      : "provider-status-light--error"
                  }`}
                  aria-hidden="true"
                />
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
