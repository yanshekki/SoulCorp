import { invoke } from "../../utils/tauriInvoke";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type {
  AgentMemoryView,
  AgentRecord,
  CompanyDepartmentsSnapshot,
  GameSettings,
  RuntimeCatalog,
} from "../../types/game";
import {
  AI_PROVIDER_DEFAULT,
  type DepartmentAiConfig,
  resolveEffectiveAiProviderLabel,
} from "../../data/aiProviders";
import { compressAgentMemory, getAgentMemory } from "../../services/agentWorkspaceClient";
import { defaultSoulMdForAgent, soulMdForAgent } from "../../utils/agentSoul";
import { validateSoulMd } from "../../utils/soulMdValidation";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { EMPLOYEE_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { SoulMdEditor } from "./SoulMdEditor";
import { AgentWorkspaceActivityFeed } from "./AgentWorkspaceActivityFeed";
import { AgentWorkspaceBrowser } from "./AgentWorkspaceBrowser";
import { SearchableListToolbar } from "./SearchableListToolbar";
import { AgentRuntimeSection } from "./command-center/AgentRuntimeSection";
import { SkillsCatalogSection } from "./brain/SkillsCatalogSection";
import { EffectiveBrainPill } from "./brain/EffectiveBrainPill";
import { AgentActivityPill } from "./observatory/AgentActivityPill";
import { ExecutionRuntimePicker } from "./brain/ExecutionRuntimePicker";
import { MeetingBrainPicker } from "./brain/MeetingBrainPicker";
import {
  isSubprocessRuntime,
  meetingBrainLabel,
  resolveEffectiveExecutionRuntimeLabel,
  runtimeModeLabel,
  transportForEntry,
} from "../../utils/agentRuntimeCatalog";
import { useI18n } from "../../i18n/I18nProvider";

export const AGENTS_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "runtime", label: "Execution runtime" },
  { id: "skills", label: "Skills" },
  { id: "workspaces", label: "Workspaces" },
  { id: "activity", label: "Activity" },
  { id: "departments", label: "Departments" },
  { id: "employees", label: "Employees" },
] as const;

interface AgentsPanelProps {
  /** Only this left-nav section is rendered (true pages, not scroll spy). */
  activeSection: string;
  onNavigateSection?: (sectionId: string) => void;
}

export function AgentsPanel({ activeSection, onNavigateSection }: AgentsPanelProps) {
  const { t } = useI18n();
  const settings = useGameStore((state) => state.settings);
  const setSettings = useGameStore((state) => state.setSettings);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const [departmentConfigs, setDepartmentConfigs] = useState<DepartmentAiConfig[]>([]);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog | null>(null);
  const [soulDrafts, setSoulDrafts] = useState<Record<string, string>>({});
  const [soulSavingId, setSoulSavingId] = useState<string | null>(null);
  const [expandedSoulId, setExpandedSoulId] = useState<string | null>(null);
  const [workspaceAgentId, setWorkspaceAgentId] = useState<string | null>(null);
  const [memoryModalAgentId, setMemoryModalAgentId] = useState<string | null>(null);
  const [memoryView, setMemoryView] = useState<AgentMemoryView | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [employeeSearchType, setEmployeeSearchType] = useState(SEARCH_TYPE_ALL);
  const debouncedEmployeeQuery = useDebouncedValue(employeeSearchQuery);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const openMemoryModal = async (agentId: string) => {
    setMemoryModalAgentId(agentId);
    setMemoryLoading(true);
    setMemoryView(null);
    try {
      const view = await getAgentMemory(agentId);
      setMemoryView(view);
    } catch (error) {
      setStatusMessage(String(error));
      setMemoryModalAgentId(null);
    } finally {
      setMemoryLoading(false);
    }
  };

  const handleCompressMemory = async () => {
    if (!memoryModalAgentId) return;
    setMemoryBusy(true);
    try {
      const view = await compressAgentMemory(memoryModalAgentId);
      setMemoryView(view);
      setStatusMessage(t("status.memoryCompressed"));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setMemoryBusy(false);
    }
  };

  const filteredAgentRecords = useMemo(
    () =>
      filterByScopedQuery(agentRecords, debouncedEmployeeQuery, employeeSearchType, {
        all: (agent) => [agent.name, agent.role, agent.department, agent.id, agent.agent_kind ?? ""],
        name: (agent) => [agent.name],
        role: (agent) => [agent.role],
        department: (agent) => [agent.department],
      }),
    [agentRecords, debouncedEmployeeQuery, employeeSearchType],
  );

  const departmentProviderMap = useMemo(
    () =>
      new Map(
        departmentConfigs.map((entry) => [entry.department, entry.ai_provider ?? null]),
      ),
    [departmentConfigs],
  );

  const departmentRuntimeMap = useMemo(
    () =>
      new Map(
        departmentConfigs.map((entry) => [entry.department, entry.agent_runtime_mode ?? null]),
      ),
    [departmentConfigs],
  );

  const companyMeetingLabel = settings.pure_local_mode
    ? "Mock (offline)"
    : `Company default · ${meetingBrainLabel(settings.ai_provider, runtimeCatalog)}`;
  const companyExecutionLabel = runtimeModeLabel(settings.agent_runtime_mode);

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
    void invoke<RuntimeCatalog>("get_agent_runtime_catalog")
      .then(setRuntimeCatalog)
      .catch(() => setRuntimeCatalog(null));
  }, []);

  const updateDepartmentRuntime = async (department: string, value: string) => {
    try {
      const updated = await invoke<DepartmentAiConfig>("update_department_runtime_mode", {
        request: {
          department,
          agent_runtime_mode: value === AI_PROVIDER_DEFAULT ? null : value,
        },
      });
      setDepartmentConfigs((current) => {
        const next = current.filter((entry) => entry.department !== department);
        next.push(updated);
        next.sort((left, right) => left.department.localeCompare(right.department));
        return next;
      });
      setStatusMessage(
        `${department} execution runtime now uses ${resolveEffectiveExecutionRuntimeLabel(
          null,
          updated.agent_runtime_mode,
          settings.agent_runtime_mode ?? "llm_only",
        )}.`,
      );
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

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
      setStatusMessage(t("status.soulSaved", { name: updated.name }));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSoulSavingId(null);
    }
  };

  const updateAgentRuntime = async (agentId: string, value: string) => {
    try {
      const updated = await invoke<AgentRecord>("update_agent_runtime_mode", {
        request: {
          agent_id: agentId,
          agent_runtime_mode: value === AI_PROVIDER_DEFAULT ? null : value,
        },
      });
      setAgentRecords(
        agentRecords.map((record) => (record.id === updated.id ? updated : record)),
      );
      setStatusMessage(
        `${updated.name} execution runtime now uses ${resolveEffectiveExecutionRuntimeLabel(
          updated.agent_runtime_mode,
          departmentRuntimeMap.get(updated.department) ?? null,
          settings.agent_runtime_mode ?? "llm_only",
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

  const meetingOverrideCount = agentRecords.filter((agent) => agent.ai_provider).length;
  const executionOverrideCount = agentRecords.filter((agent) => agent.agent_runtime_mode).length;
  const departmentMeetingOverrideCount = departmentConfigs.filter((entry) => entry.ai_provider).length;
  const departmentExecutionOverrideCount = departmentConfigs.filter(
    (entry) => entry.agent_runtime_mode,
  ).length;
  const subprocessRuntime = isSubprocessRuntime(settings.agent_runtime_mode);

  const persistRuntimeSettings = async (patch: Partial<GameSettings>) => {
    try {
      const next = await invoke<GameSettings>("update_game_settings", {
        update: {
          agent_runtime_mode: patch.agent_runtime_mode,
          openclaw_binary_path: patch.openclaw_binary_path,
          openclaw_use_local: patch.openclaw_use_local,
          openclaw_prefer_gateway: patch.openclaw_prefer_gateway,
          openclaw_default_agent_id: patch.openclaw_default_agent_id,
          openclaw_timeout_secs: patch.openclaw_timeout_secs,
          agent_runtime_fallback_to_llm: patch.agent_runtime_fallback_to_llm,
          agent_runtime_custom_binary: patch.agent_runtime_custom_binary,
          agent_runtime_custom_adapter: patch.agent_runtime_custom_adapter,
          agent_runtime_allow_cli_env_keys: patch.agent_runtime_allow_cli_env_keys,
        },
      });
      setSettings(next);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="agents-panel agents-panel--page" ref={scrollRootRef}>
      {activeSection === "overview" ? (
      <section
        id="overview"
        className="agents-card agents-card--wide"
        data-agents-section="overview"
      >
        <header className="agents-card-header agents-card-header--stacked">
          <h3>{t("agents.brainResolution")}</h3>
          <p className="muted">{t("agents.brainResolutionDesc")}</p>
        </header>

        <div className="agents-priority-stack">
          <div className="agents-priority-layer">
            <p className="agents-priority-layer-label">{t("agents.meetingBrain")}</p>
            <div className="agents-priority-flow">
              <article>
                <strong>{t("agents.priority.agent")}</strong>
                <span>{t("agents.priority.agentDesc")}</span>
              </article>
              <span className="agents-priority-arrow" aria-hidden="true">
                →
              </span>
              <article>
                <strong>{t("agents.priority.dept")}</strong>
                <span>{t("agents.priority.deptDesc")}</span>
              </article>
              <span className="agents-priority-arrow" aria-hidden="true">
                →
              </span>
              <article>
                <strong>{t("agents.priority.company")}</strong>
                <span>{companyMeetingLabel}</span>
              </article>
            </div>
          </div>
          <div className="agents-priority-layer">
            <p className="agents-priority-layer-label">{t("agents.priority.execLayer")}</p>
            <div className="agents-priority-flow">
              <article>
                <strong>{t("agents.priority.agent")}</strong>
                <span>{t("agents.priority.agentExecDesc")}</span>
              </article>
              <span className="agents-priority-arrow" aria-hidden="true">
                →
              </span>
              <article>
                <strong>{t("agents.priority.dept")}</strong>
                <span>{t("agents.priority.deptExecDesc")}</span>
              </article>
              <span className="agents-priority-arrow" aria-hidden="true">
                →
              </span>
              <article>
                <strong>{t("agents.priority.company")}</strong>
                <span>{companyExecutionLabel}</span>
              </article>
            </div>
          </div>
        </div>

        <div className="agents-overview-stats">
          <article>
            <strong>{departmentConfigs.length}</strong>
            <span>{t("agents.stat.departments")}</span>
          </article>
          <article>
            <strong>{departmentMeetingOverrideCount}</strong>
            <span>{t("agents.stat.deptMeetingOverrides")}</span>
          </article>
          <article>
            <strong>{departmentExecutionOverrideCount}</strong>
            <span>{t("agents.stat.deptRuntimeOverrides")}</span>
          </article>
          <article>
            <strong>{agentRecords.length}</strong>
            <span>{t("agents.stat.employees")}</span>
          </article>
          <article>
            <strong>{meetingOverrideCount}</strong>
            <span>{t("agents.stat.agentMeetingOverrides")}</span>
          </article>
          <article>
            <strong>{executionOverrideCount}</strong>
            <span>{t("agents.stat.agentRuntimeOverrides")}</span>
          </article>
          <article>
            <strong>{subprocessRuntime ? t("agents.stat.cli") : t("agents.stat.llm")}</strong>
            <span>{companyExecutionLabel}</span>
          </article>
        </div>

        {settings.pure_local_mode ? (
          <p className="hub-warning">
            {t("agents.pureLocalWarning")}
          </p>
        ) : (
          <p className="muted">
            {t("agents.apiKeysIn")}{" "}
            <button type="button" className="agents-inline-link" onClick={() => setActivePanel("settings")}>
              {t("agents.openSettings")}
            </button>
            . {t("agents.tokenLimitsIn")}{" "}
            <button type="button" className="agents-inline-link" onClick={() => setActivePanel("finance")}>
              {t("agents.openTokens")}
            </button>
            .
          </p>
        )}
      </section>
      ) : null}

      {activeSection === "runtime" ? (
      <section
        id="runtime"
        className="agents-card agents-card--wide"
        data-agents-section="runtime"
      >
        <header className="agents-card-header agents-card-header--stacked">
          <h3>{t("agents.executionRuntime")}</h3>
          <p className="muted">{t("agents.executionRuntimeDesc")}</p>
        </header>
        <AgentRuntimeSection
          settings={settings}
          onPersist={persistRuntimeSettings}
          onStatusMessage={setStatusMessage}
        />
      </section>
      ) : null}

      {activeSection === "skills" ? <SkillsCatalogSection /> : null}

      {activeSection === "workspaces" ? (
      <AgentWorkspaceBrowser
        agents={agentRecords}
        selectedAgentId={workspaceAgentId}
        onSelectAgent={setWorkspaceAgentId}
      />
      ) : null}

      {activeSection === "activity" ? <AgentWorkspaceActivityFeed /> : null}

      {activeSection === "departments" ? (
      <section
        id="departments"
        className="agents-card agents-card--wide"
        data-agents-section="departments"
      >
        <header className="agents-card-header">
          <h3>{t("agents.deptBrains")}</h3>
          <span className="muted">{t("agents.nDepartments", { count: departmentConfigs.length })}</span>
        </header>

        {departmentConfigs.length === 0 ? (
          <p className="muted">{t("agents.noDepartments")}</p>
        ) : (
          <div className="agents-brain-grid">
            {departmentConfigs.map((entry) => {
              const meetingSelected = entry.ai_provider ?? AI_PROVIDER_DEFAULT;
              const executionSelected = entry.agent_runtime_mode ?? AI_PROVIDER_DEFAULT;
              const effectiveMeetingLabel = resolveEffectiveAiProviderLabel(
                null,
                entry.ai_provider,
                settings.ai_provider,
                settings.pure_local_mode,
              );
              const effectiveExecutionLabel = resolveEffectiveExecutionRuntimeLabel(
                null,
                entry.agent_runtime_mode,
                settings.agent_runtime_mode ?? "llm_only",
              );
              const meetingEntry = runtimeCatalog?.runtimes.find(
                (runtime) =>
                  runtime.id === entry.ai_provider
                  || runtime.api_provider_id === entry.ai_provider,
              );
              const executionEntry = runtimeCatalog?.runtimes.find(
                (runtime) => runtime.id === entry.agent_runtime_mode,
              );
              return (
                <article key={entry.department} className="agents-brain-card">
                  <div className="agents-brain-card-head">
                    <div className="agents-brain-card-title">
                      <strong>{entry.department}</strong>
                      <div className="agents-effective-pill-row">
                        <EffectiveBrainPill
                          label={effectiveMeetingLabel}
                          transport={transportForEntry(meetingEntry)}
                        />
                        <EffectiveBrainPill
                          label={effectiveExecutionLabel}
                          transport={transportForEntry(executionEntry)}
                        />
                      </div>
                    </div>
                  </div>
                  <label className="field-label brain-provider-field">
                    {t("agents.meetingBrain")}
                    <MeetingBrainPicker
                      catalog={runtimeCatalog}
                      value={meetingSelected}
                      inheritLabel={t("agents.companyDefault")}
                      disabled={settings.pure_local_mode}
                      onChange={(value) => void updateDepartmentProvider(entry.department, value)}
                    />
                  </label>
                  <p className="muted agents-field-hint">{t("agents.meetingHint")}</p>
                  <label className="field-label brain-provider-field">
                    {t("agents.executionRuntime")}
                    <ExecutionRuntimePicker
                      catalog={runtimeCatalog}
                      value={executionSelected}
                      inheritLabel={t("agents.companyDefault")}
                      onChange={(value) => void updateDepartmentRuntime(entry.department, value)}
                    />
                  </label>
                  <p className="muted agents-field-hint">
                    {t("agents.executionHint")}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "employees" ? (
      <section
        id="employees"
        className="agents-card agents-card--wide"
        data-agents-section="employees"
      >
        <header className="agents-card-header">
          <h3>{t("agents.employeeOverrides")}</h3>
          <span className="muted">
            {debouncedEmployeeQuery.trim()
              ? t("agents.nMatches", { count: filteredAgentRecords.length })
              : t("agents.nAgents", { count: agentRecords.length })}
          </span>
        </header>

        {agentRecords.length === 0 ? (
          <p className="muted">{t("agents.noAgentsHire")}</p>
        ) : (
          <>
            <SearchableListToolbar
              query={employeeSearchQuery}
              onQueryChange={setEmployeeSearchQuery}
              placeholder={t("agents.searchEmployees")}
              ariaLabel={t("agents.searchEmployees")}
              matchCount={
                debouncedEmployeeQuery.trim() ? filteredAgentRecords.length : undefined
              }
              totalCount={agentRecords.length}
              typeFilter={{
                value: employeeSearchType,
                onChange: setEmployeeSearchType,
                options: EMPLOYEE_SEARCH_TYPES,
                ariaLabel: t("agents.filterEmployeesAria"),
                label: t("searchType.typeLabel"),
              }}
            />
            {debouncedEmployeeQuery.trim() && filteredAgentRecords.length === 0 ? (
              <p className="search-empty-hint muted">
                {t("agents.noMatchesQuery", { query: debouncedEmployeeQuery })}
              </p>
            ) : null}
          <div className="agents-brain-grid agents-employee-grid">
            {filteredAgentRecords.map((agent) => {
              const meetingSelected = agent.ai_provider ?? AI_PROVIDER_DEFAULT;
              const executionSelected = agent.agent_runtime_mode ?? AI_PROVIDER_DEFAULT;
              const departmentProvider = departmentProviderMap.get(agent.department) ?? null;
              const departmentRuntime = departmentRuntimeMap.get(agent.department) ?? null;
              const effectiveMeetingLabel = resolveEffectiveAiProviderLabel(
                agent.ai_provider,
                departmentProvider,
                settings.ai_provider,
                settings.pure_local_mode,
              );
              const effectiveExecutionLabel = resolveEffectiveExecutionRuntimeLabel(
                agent.agent_runtime_mode,
                departmentRuntime,
                settings.agent_runtime_mode ?? "llm_only",
              );
              const meetingEntry = runtimeCatalog?.runtimes.find(
                (runtime) =>
                  runtime.id === agent.ai_provider
                  || runtime.api_provider_id === agent.ai_provider,
              );
              const executionEntry = runtimeCatalog?.runtimes.find(
                (runtime) => runtime.id === agent.agent_runtime_mode,
              );
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
                        <AgentActivityPill
                          agentId={agent.id}
                          onClick={() => {
                            setActivePanel("observatory");
                          }}
                        />
                      </strong>
                      <div className="agents-effective-pill-row">
                        <EffectiveBrainPill
                          label={effectiveMeetingLabel}
                          transport={transportForEntry(meetingEntry)}
                        />
                        <EffectiveBrainPill
                          label={effectiveExecutionLabel}
                          transport={transportForEntry(executionEntry)}
                        />
                      </div>
                    </div>
                    <p className="muted agents-brain-card-subtitle">
                      {agent.role} · {agent.department}
                    </p>
                  </div>
                  <p className="agents-employee-meta muted">
                    {agent.soul ? t("agents.soulLoaded") : t("agents.soulDraft")}
                    {agent.soul?.hub_file_type
                      ? ` · ${
                          agent.soul.hub_file_type === "full_soul_folder"
                            ? t("agents.hubModular")
                            : t("agents.hubSingle")
                        }`
                      : null}
                  </p>
                  {agent.agent_kind !== "fate" ? (
                    <div className="panel-actions" style={{ marginBottom: "0.5rem" }}>
                      <button
                        type="button"
                        className="agents-soul-toggle"
                        onClick={() => void openMemoryModal(agent.id)}
                      >
                        {t("agents.viewMemory")}
                      </button>
                    </div>
                  ) : null}
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
                        {soulExpanded ? t("agents.hideSoul") : t("agents.editSoul")}
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
                            {soulSavingId === agent.id ? t("common.saving") : t("agents.saveSoul")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="field-label brain-provider-field">
                    {t("agents.meetingBrain")}
                    <MeetingBrainPicker
                      catalog={runtimeCatalog}
                      value={meetingSelected}
                      inheritLabel={t("provider.deptDefault")}
                      disabled={settings.pure_local_mode || agent.agent_kind === "fate"}
                      onChange={(value) => void updateAgentProvider(agent.id, value)}
                    />
                  </label>
                  <p className="muted agents-field-hint">{t("agents.meetingDialogueHint")}</p>
                  <label className="field-label brain-provider-field">
                    {t("agents.executionRuntime")}
                    <ExecutionRuntimePicker
                      catalog={runtimeCatalog}
                      value={executionSelected}
                      inheritLabel={t("provider.deptDefault")}
                      disabled={agent.agent_kind === "fate"}
                      onChange={(value) => void updateAgentRuntime(agent.id, value)}
                    />
                  </label>
                  <p className="muted agents-field-hint">
                    {t("agents.executionSprintHint")}
                  </p>
                  {agent.agent_kind !== "fate" ? (
                    <button
                      type="button"
                      className="agents-workspace-jump"
                      onClick={() => {
                        setWorkspaceAgentId(agent.id);
                        onNavigateSection?.("workspaces");
                      }}
                    >
                      {t("agents.browseWorkspace")}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
          </>
        )}
      </section>
      ) : null}

      {memoryModalAgentId ? (
        <div
          className="agents-memory-modal-backdrop"
          role="presentation"
          onClick={() => {
            setMemoryModalAgentId(null);
            setMemoryView(null);
          }}
        >
          <div
            className="agents-memory-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("agents.memoryAria")}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="agents-memory-modal-header">
              <div>
                <h3>{t("agents.memoryMd")}</h3>
                <p className="muted">{t("agents.memoryHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMemoryModalAgentId(null);
                  setMemoryView(null);
                }}
              >
                {t("common.close")}
              </button>
            </header>
            {memoryLoading ? (
              <p className="muted">{t("agents.loadingMemory")}</p>
            ) : memoryView ? (
              <>
                <p className="muted agents-memory-meta">
                  {memoryView.chars.toLocaleString()} chars
                  {memoryView.last_compressed_at
                    ? ` · last compressed ${memoryView.last_compressed_at}`
                    : ""}
                  {` · ${memoryView.tasks_since_compress} task(s) since compress`}
                </p>
                <pre className="agents-memory-body">{memoryView.text}</pre>
                <div className="panel-actions">
                  <button
                    type="button"
                    disabled={memoryBusy}
                    onClick={() => void handleCompressMemory()}
                  >
                    {memoryBusy ? t("agents.compressing") : t("agents.compressNow")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMemoryModalAgentId(null);
                      setMemoryView(null);
                    }}
                  >
                    {t("common.close")}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">{t("agents.noMemory")}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}