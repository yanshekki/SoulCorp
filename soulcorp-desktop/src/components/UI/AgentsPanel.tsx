import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import {
  AGENT_AI_PROVIDER_OPTIONS,
  AI_PROVIDER_DEFAULT,
  AI_PROVIDER_OPTIONS,
  type DepartmentAiConfig,
  resolveEffectiveAiProviderLabel,
} from "../../data/aiProviders";
import type { AgentRecord, CompanyDepartmentsSnapshot } from "../../types/game";
import { defaultSoulMdForAgent, soulMdForAgent } from "../../utils/agentSoul";
import { validateSoulMd } from "../../utils/soulMdValidation";
import { SoulMdEditor } from "./SoulMdEditor";

export const AGENTS_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "departments", label: "Departments" },
  { id: "employees", label: "Employees" },
] as const;

interface AgentsPanelProps {
  onSectionFocus?: (sectionId: string) => void;
}

export function AgentsPanel({ onSectionFocus }: AgentsPanelProps) {
  const settings = useGameStore((state) => state.settings);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const [departmentConfigs, setDepartmentConfigs] = useState<DepartmentAiConfig[]>([]);
  const [soulDrafts, setSoulDrafts] = useState<Record<string, string>>({});
  const [soulSavingId, setSoulSavingId] = useState<string | null>(null);
  const [expandedSoulId, setExpandedSoulId] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const departmentProviderMap = useMemo(
    () =>
      new Map(
        departmentConfigs.map((entry) => [entry.department, entry.ai_provider ?? null]),
      ),
    [departmentConfigs],
  );

  const companyDefaultLabel = resolveEffectiveAiProviderLabel(
    null,
    null,
    settings.ai_provider,
    settings.pure_local_mode,
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
  }, [activeCompanyId, refreshDepartments]);

  useEffect(() => {
    if (!onSectionFocus) {
      return;
    }
    const root = scrollRootRef.current?.closest(".app-page-content");
    const sections = scrollRootRef.current?.querySelectorAll("[data-agents-section]");
    if (!root || !sections?.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-agents-section");
        if (sectionId) {
          onSectionFocus(sectionId);
        }
      },
      { root, rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onSectionFocus, departmentConfigs.length, agentRecords.length]);

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

  const soulDraftForAgent = useCallback(
    (agent: AgentRecord) => soulDrafts[agent.id] ?? soulMdForAgent(agent),
    [soulDrafts],
  );

  const updateSoulDraft = (agentId: string, content: string) => {
    setSoulDrafts((current) => ({ ...current, [agentId]: content }));
  };

  const saveAgentSoul = async (agent: AgentRecord) => {
    const content = soulDraftForAgent(agent);
    const validation = validateSoulMd(content);
    if (!validation.valid) {
      setStatusMessage(validation.error ?? "Invalid soul.md.");
      return;
    }

    setSoulSavingId(agent.id);
    try {
      const updated = await invoke<AgentRecord>("update_agent_soul", {
        request: {
          agent_id: agent.id,
          soul_md_content: content,
        },
      });
      setAgentRecords(
        agentRecords.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setSoulDrafts((current) => {
        const next = { ...current };
        delete next[agent.id];
        return next;
      });
      setStatusMessage(`${updated.name}'s soul.md saved. AI will use the updated persona.`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSoulSavingId(null);
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
        agentRecords.map((record) => (record.id === updated.id ? updated : record)),
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

  const overrideCount = agentRecords.filter((agent) => agent.ai_provider).length;
  const departmentOverrideCount = departmentConfigs.filter((entry) => entry.ai_provider).length;
  return (
    <div className="agents-panel agents-panel--page" ref={scrollRootRef}>
      <section
        id="overview"
        className="agents-card agents-card--wide"
        data-agents-section="overview"
      >
        <header className="agents-card-header agents-card-header--stacked">
          <h3>Brain resolution</h3>
          <p className="muted">
            Pick the LLM per department or employee, and edit soul.md personas after hire. Token
            allocation and period caps live in the Tokens panel.
          </p>
        </header>

        <div className="agents-priority-flow">
          <article>
            <strong>1. Agent override</strong>
            <span>Per-employee selection below</span>
          </article>
          <span className="agents-priority-arrow" aria-hidden="true">
            →
          </span>
          <article>
            <strong>2. Department default</strong>
            <span>Team-wide brain assignment</span>
          </article>
          <span className="agents-priority-arrow" aria-hidden="true">
            →
          </span>
          <article>
            <strong>3. Company default</strong>
            <span>{companyDefaultLabel}</span>
          </article>
        </div>

        <div className="agents-overview-stats">
          <article>
            <strong>{departmentConfigs.length}</strong>
            <span>Departments</span>
          </article>
          <article>
            <strong>{departmentOverrideCount}</strong>
            <span>Dept overrides</span>
          </article>
          <article>
            <strong>{agentRecords.length}</strong>
            <span>Employees</span>
          </article>
          <article>
            <strong>{overrideCount}</strong>
            <span>Agent overrides</span>
          </article>
        </div>

        {settings.pure_local_mode ? (
          <p className="hub-warning">
            Pure Local Mode forces mock dialogue for every department and agent.
          </p>
        ) : (
          <p className="muted">
            API keys in{" "}
            <button type="button" className="agents-inline-link" onClick={() => setActivePanel("settings")}>
              Settings
            </button>
            . Token limits in{" "}
            <button type="button" className="agents-inline-link" onClick={() => setActivePanel("finance")}>
              Tokens
            </button>
            .
          </p>
        )}
      </section>

      <section
        id="departments"
        className="agents-card agents-card--wide"
        data-agents-section="departments"
      >
        <header className="agents-card-header">
          <h3>Department LLM brains</h3>
          <span className="muted">{departmentConfigs.length} departments</span>
        </header>

        {departmentConfigs.length === 0 ? (
          <p className="muted">No departments available yet.</p>
        ) : (
          <div className="agents-brain-grid">
            {departmentConfigs.map((entry) => {
              const selected = entry.ai_provider ?? AI_PROVIDER_DEFAULT;
              return (
                <article key={entry.department} className="agents-brain-card">
                  <div className="agents-brain-card-head">
                    <div className="agents-brain-card-title">
                      <strong>{entry.department}</strong>
                      <span className="agents-effective-pill">
                        {resolveEffectiveAiProviderLabel(
                          null,
                          entry.ai_provider,
                          settings.ai_provider,
                          settings.pure_local_mode,
                        )}
                      </span>
                    </div>
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
      </section>

      <section
        id="employees"
        className="agents-card agents-card--wide"
        data-agents-section="employees"
      >
        <header className="agents-card-header">
          <h3>Employee overrides</h3>
          <span className="muted">{agentRecords.length} agents</span>
        </header>

        {agentRecords.length === 0 ? (
          <p className="muted">Hire or onboard agents before assigning individual LLM brains.</p>
        ) : (
          <div className="agents-brain-grid agents-employee-grid">
            {agentRecords.map((agent) => {
              const selected = agent.ai_provider ?? AI_PROVIDER_DEFAULT;
              const departmentProvider = departmentProviderMap.get(agent.department) ?? null;
              const soulDraft = soulDraftForAgent(agent);
              const baselineSoul = agent.soul?.raw_content?.trim()
                ? agent.soul.raw_content
                : defaultSoulMdForAgent(agent);
              const soulDirty = soulDraft.trim() !== baselineSoul.trim();
              const soulExpanded = expandedSoulId === agent.id;
              const soulReadOnly = agent.agent_kind === "fate";
              const soulValid = validateSoulMd(soulDraft).valid;
              return (
                <article key={agent.id} className="agents-brain-card agents-employee-card">
                  <div className="agents-brain-card-head">
                    <div className="agents-brain-card-title">
                      <strong>
                        {agent.name}
                        {agent.agent_kind === "fate" ? (
                          <span className="fate-agent-badge"> · Fate</span>
                        ) : null}
                      </strong>
                      <span className="agents-effective-pill">
                        {resolveEffectiveAiProviderLabel(
                          agent.ai_provider,
                          departmentProvider,
                          settings.ai_provider,
                          settings.pure_local_mode,
                        )}
                      </span>
                    </div>
                    <p className="muted agents-brain-card-subtitle">
                      {agent.role} · {agent.department}
                    </p>
                  </div>
                  <p className="agents-employee-meta muted">
                    Soul: {agent.soul ? "loaded" : "draft"}
                    {agent.soul?.hub_file_type
                      ? ` · ${agent.soul.hub_file_type === "full_soul_folder" ? "Modular hub" : "Hub"}`
                      : null}
                  </p>
                  {!soulReadOnly ? (
                    <div className="agents-soul-section">
                      <button
                        type="button"
                        className="agents-soul-toggle"
                        onClick={() =>
                          setExpandedSoulId((current) =>
                            current === agent.id ? null : agent.id,
                          )
                        }
                      >
                        {soulExpanded ? "Hide soul.md" : "Edit soul.md"}
                      </button>
                      {soulExpanded ? (
                        <div className="agents-soul-editor-wrap">
                          <SoulMdEditor
                            value={soulDraft}
                            onChange={(content) => updateSoulDraft(agent.id, content)}
                            minRows={10}
                          />
                          <button
                            type="button"
                            className="agents-soul-save"
                            disabled={
                              soulSavingId === agent.id || !soulDirty || !soulValid
                            }
                            onClick={() => void saveAgentSoul(agent)}
                          >
                            {soulSavingId === agent.id ? "Saving…" : "Save soul.md"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
      </section>
    </div>
  );
}