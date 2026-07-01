import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import {
  AGENT_AI_PROVIDER_OPTIONS,
  AI_PROVIDER_DEFAULT,
  AI_PROVIDER_OPTIONS,
  type DepartmentAiConfig,
  resolveEffectiveAiProviderLabel,
} from "../../data/aiProviders";
import type { AgentRecord, CompanyDepartmentsSnapshot } from "../../types/game";

function formatTokens(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function AgentsPanel() {
  const settings = useGameStore((state) => state.settings);
  const finance = useGameStore((state) => state.finance);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [departmentConfigs, setDepartmentConfigs] = useState<DepartmentAiConfig[]>([]);

  const departmentProviderMap = useMemo(
    () =>
      new Map(
        departmentConfigs.map((entry) => [entry.department, entry.ai_provider ?? null]),
      ),
    [departmentConfigs],
  );

  const refreshDepartments = useCallback(async () => {
    try {
      const snapshot = await invoke<CompanyDepartmentsSnapshot>("list_company_departments");
      setDepartmentConfigs(snapshot.department_ai_providers ?? []);
    } catch (error) {
      setStatusMessage(String(error));
    }
  }, [setStatusMessage]);

  useEffect(() => {
    void refreshDepartments();
  }, [refreshDepartments, agentRecords.length]);

  const updateDepartmentProvider = async (department: string, value: string) => {
    try {
      const updated = await invoke<DepartmentAiConfig>("update_department_ai_provider", {
        request: {
          department,
          ai_provider: value === AI_PROVIDER_DEFAULT ? null : value,
        },
      });
      setDepartmentConfigs((current) => {
        const next = current.filter((entry) => entry.department !== department);
        next.push(updated);
        next.sort((left, right) => left.department.localeCompare(right.department));
        return next;
      });
      setStatusMessage(
        `${department} department now uses ${resolveEffectiveAiProviderLabel(
          null,
          updated.ai_provider,
          settings.ai_provider,
        )}.`,
      );
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const updateAgentProvider = async (agentId: string, value: string) => {
    try {
      const updated = await invoke<AgentRecord>("update_agent_ai_provider", {
        request: {
          agent_id: agentId,
          ai_provider: value === AI_PROVIDER_DEFAULT ? null : value,
        },
      });
      setAgentRecords(
        agentRecords.map((agent) => (agent.id === updated.id ? updated : agent)),
      );
      setStatusMessage(
        `${updated.name} now uses ${resolveEffectiveAiProviderLabel(
          updated.ai_provider,
          departmentProviderMap.get(updated.department) ?? null,
          settings.ai_provider,
        )}.`,
      );
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <section className="panel-card">
      <h2>Agent Brains</h2>
      <p className="muted">
        Assign LLM brains at department level, then override per employee. Priority: agent →
        department → company default from Settings.
      </p>

      <div className="brain-section">
        <h3>Department LLM brains</h3>
        {departmentConfigs.length === 0 ? (
          <p className="muted">No departments available yet.</p>
        ) : (
          <div className="agent-list compact">
            {departmentConfigs.map((entry) => {
              const selected = entry.ai_provider ?? AI_PROVIDER_DEFAULT;
              return (
                <article key={entry.department} className="agent-row brain-row">
                  <div>
                    <strong>{entry.department}</strong>
                    <p className="muted">
                      Effective:{" "}
                      {resolveEffectiveAiProviderLabel(
                        null,
                        entry.ai_provider,
                        settings.ai_provider,
                        settings.pure_local_mode,
                      )}
                    </p>
                  </div>
                  <label className="field-label brain-provider-field">
                    LLM brain
                    <select
                      value={selected}
                      onChange={(event) =>
                        void updateDepartmentProvider(entry.department, event.target.value)
                      }
                      disabled={settings.pure_local_mode}
                    >
                      {AI_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="brain-section">
        <h3>Employee overrides</h3>
        {agentRecords.length === 0 ? (
          <p className="muted">Hire or onboard agents before assigning individual LLM brains.</p>
        ) : (
          <div className="agent-list compact">
            {agentRecords.map((agent) => {
              const selected = agent.ai_provider ?? AI_PROVIDER_DEFAULT;
              const departmentProvider =
                departmentProviderMap.get(agent.department) ?? null;
              const wallet = finance.agents[agent.id];
              return (
                <article key={agent.id} className="agent-row brain-row">
                  <div>
                    <strong>
                      {agent.name}
                      {agent.agent_kind === "fate" ? (
                        <span className="fate-agent-badge"> · Controls random events</span>
                      ) : null}
                    </strong>
                    <p>
                      {agent.role} · {agent.department}
                    </p>
                    <p className="muted">
                      Soul: {agent.soul ? "loaded" : "not loaded"} · Effective:{" "}
                      {resolveEffectiveAiProviderLabel(
                        agent.ai_provider,
                        departmentProvider,
                        settings.ai_provider,
                        settings.pure_local_mode,
                      )}
                      {wallet ? (
                        <>
                          {" "}
                          · Tokens: {formatTokens(wallet.balance)} balance /{" "}
                          {formatTokens(wallet.spent)} spent
                        </>
                      ) : (
                        " · Tokens: no wallet"
                      )}
                    </p>
                  </div>
                  <label className="field-label brain-provider-field">
                    LLM brain
                    <select
                      value={selected}
                      onChange={(event) => void updateAgentProvider(agent.id, event.target.value)}
                      disabled={settings.pure_local_mode || agent.agent_kind === "fate"}
                    >
                      {AGENT_AI_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {settings.pure_local_mode ? (
        <p className="hub-warning">Pure Local Mode forces mock dialogue for every department and agent.</p>
      ) : (
        <p className="muted">
          Company default: {resolveEffectiveAiProviderLabel(null, null, settings.ai_provider)}. API
          keys and endpoints are configured in Settings.
        </p>
      )}
    </section>
  );
}