import { invoke } from "../../../utils/tauriInvoke";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showSimulationChrome, simulationAutoRun } from "../../../config/features";
import { useGameStore } from "../../../stores/gameStore";
import type {
  AutomationStatus,
  CommandCenterOverview,
  Directive,
  DirectivePreviewNode,
  DirectiveTarget,
  GameSettings,
  InternalProject,
  ScrumSnapshot,
} from "../../../types/game";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { formatAgentOptionLabel } from "../../../utils/agentLabel";
import { isSubprocessRuntime, runtimeModeLabel } from "../../../utils/agentRuntimeCatalog";
import { formatTimestamp } from "../../../utils/formatTimestamp";
import { DIRECTIVE_SEARCH_TYPES } from "../../../data/searchFilterOptions";
import { filterByQuery } from "../../../utils/listSearch";
import { SEARCH_TYPE_ALL } from "../../../utils/searchTypeFilters";
import { paginateItems } from "../../../utils/pagination";
import { notifyScrumChanged } from "../../../utils/scrumSync";
import { useCompanyDepartments } from "../../../hooks/useCompanyDepartments";
import { PaginationBar } from "../PaginationBar";
import { SearchableListToolbar } from "../SearchableListToolbar";
import { AutopilotPipelinePanel } from "./AutopilotPipelinePanel";
import { CoCeoPanel } from "./CoCeoPanel";
import {
  cancelDirective,
  closeSprint,
  createProject,
  createSprint,
  getCommandCenterOverview,
  getScrumSnapshot,
  issueDirective,
  planSprint,
  previewRouteDirective,
  routeDirective,
  runBatchExecutions,
  setDefaultPmAgent,
  startSprint,
  updateDirectiveStatus,
  updateProject,
} from "../../../services/scrumClient";
import { useI18n } from "../../../i18n/I18nProvider";
import { alertMessage, readinessDetail, readinessLabel } from "../../../i18n/commandMessages";
import {
  autopilotPhaseLabel,
  workerLogLine,
} from "../../../i18n/autopilotMessages";

const DIRECTIVE_TEMPLATE_KEYS = [
  { id: "ship", labelKey: "command.tpl.ship.label", titleKey: "command.tpl.ship.title", bodyKey: "command.tpl.ship.body" },
  { id: "fix", labelKey: "command.tpl.fix.label", titleKey: "command.tpl.fix.title", bodyKey: "command.tpl.fix.body" },
  { id: "research", labelKey: "command.tpl.research.label", titleKey: "command.tpl.research.title", bodyKey: "command.tpl.research.body" },
  { id: "hire", labelKey: "command.tpl.hire.label", titleKey: "command.tpl.hire.title", bodyKey: "command.tpl.hire.body" },
  { id: "cost", labelKey: "command.tpl.cost.label", titleKey: "command.tpl.cost.title", bodyKey: "command.tpl.cost.body" },
] as const;

type CommandTab = "overview" | "directives" | "co_ceo" | "projects" | "sprint" | "policies";

interface CommandCenterPanelProps {
  onJumpToSection?: (sectionId: string) => void;
}

function sourceLabelKey(source: string): string {
  switch (source) {
    case "meeting":
      return "command.source.meeting";
    case "co_ceo":
      return "command.source.coCeo";
    case "marketplace":
      return "command.source.marketplace";
    default:
      return "command.source.ceo";
  }
}

function PreviewTree({ nodes, depth = 0 }: { nodes: DirectivePreviewNode[]; depth?: number }) {
  return (
    <ul className="command-preview-tree" style={{ marginLeft: depth * 12 }}>
      {nodes.map((node) => (
        <li key={`${depth}-${node.title}`}>
          <strong>{node.kind}</strong> {node.title}
          <span className="muted">
            {" "}
            · {node.department} · {node.story_points}pt
          </span>
          {node.children.length > 0 ? <PreviewTree nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function CommandCenterPanel({ onJumpToSection }: CommandCenterPanelProps) {
  const { t } = useI18n();
  const activeCompanyId = useGameStore((s) => s.activeCompanyId);
  const scrumRevision = useGameStore((s) => s.scrumRevision);
  const simulationDay = useGameStore((s) => s.simulation.dayNumber);
  const agentRecords = useGameStore((s) => s.agentRecords);
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const setStatusMessage = useGameStore((s) => s.setStatusMessage);
  const finance = useGameStore((s) => s.finance);
  const { departmentNames: departments } = useCompanyDepartments();

  const [tab, setTab] = useState<CommandTab>("overview");
  const [snapshot, setSnapshot] = useState<ScrumSnapshot | null>(null);
  const [overview, setOverview] = useState<CommandCenterOverview | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [automation, setAutomation] = useState<AutomationStatus | null>(null);

  const [directiveTitle, setDirectiveTitle] = useState("");
  const [directiveBody, setDirectiveBody] = useState("");
  const [targetType, setTargetType] = useState<DirectiveTarget>("project");
  const [targetRef, setTargetRef] = useState("");
  const [useLlm, setUseLlm] = useState(true);
  const [planAfterRoute, setPlanAfterRoute] = useState(false);
  const [preview, setPreview] = useState<DirectivePreviewNode[] | null>(null);
  const [selectedDirectiveId, setSelectedDirectiveId] = useState<string | null>(null);
  const [directiveFilter, setDirectiveFilter] = useState<string>(SEARCH_TYPE_ALL);
  const [directiveSearchQuery, setDirectiveSearchQuery] = useState("");
  const [directiveListPage, setDirectiveListPage] = useState(0);
  const debouncedDirectiveQuery = useDebouncedValue(directiveSearchQuery);

  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDept, setNewProjectDept] = useState(departments[0] ?? "Engineering");
  const [editProjectDesc, setEditProjectDesc] = useState("");
  const [editProjectPriority, setEditProjectPriority] = useState(3);
  const [editProjectCycle, setEditProjectCycle] = useState(14);
  const [editProjectPm, setEditProjectPm] = useState("");

  const [sprintName, setSprintName] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintVelocity, setSprintVelocity] = useState(21);
  const skipScrumSyncRef = useRef(false);

  const agents = useMemo(
    () =>
      agentRecords
        .filter((a) => a.agent_kind !== "fate")
        .map((a) => ({ id: a.id, name: a.name, role: a.role, department: a.department })),
    [agentRecords],
  );

  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;
  const loadGenerationRef = useRef(0);

  const loadSnapshot = useCallback(
    async (projectId?: string) => {
      const pid = projectId || selectedProjectIdRef.current || undefined;
      const generation = ++loadGenerationRef.current;
      try {
        const [data, ov] = await Promise.all([
          getScrumSnapshot(pid),
          getCommandCenterOverview(pid),
        ]);
        // Ignore stale responses so rapid worker ticks don't thrash UI state.
        if (generation !== loadGenerationRef.current) {
          return;
        }
        // Soft update: replace values only — never clear to null mid-refresh.
        setSnapshot(data);
        setOverview(ov);
      } catch (error) {
        if (generation === loadGenerationRef.current) {
          setStatusMessage(String(error));
        }
      }
    },
    [setStatusMessage],
  );

  const syncScrumSnapshot = useCallback(
    async (projectId?: string) => {
      await loadSnapshot(projectId);
      skipScrumSyncRef.current = true;
      notifyScrumChanged();
    },
    [loadSnapshot],
  );

  useEffect(() => {
    if (!activeCompanyId || scrumRevision === 0) {
      return;
    }
    if (skipScrumSyncRef.current) {
      skipScrumSyncRef.current = false;
      return;
    }
    void loadSnapshot(selectedProjectIdRef.current || undefined);
  }, [scrumRevision, activeCompanyId, loadSnapshot]);

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    setTargetRef(projectId);
    void loadSnapshot(projectId);
  };

  useEffect(() => {
    setOverview(null);
    setSnapshot(null);
    setSelectedProjectId("");
    setSelectedDirectiveId(null);
    setPreview(null);
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [data, ov] = await Promise.all([
          getScrumSnapshot(),
          getCommandCenterOverview(),
        ]);
        if (cancelled) {
          return;
        }
        setSnapshot(data);
        setOverview(ov);
        setSelectedProjectId((current) => {
          if (current && data.projects.some((p) => p.id === current)) {
            return current;
          }
          return data.projects[0]?.id ?? "";
        });
        setTargetRef((current) => {
          if (current && data.projects.some((p) => p.id === current)) {
            return current;
          }
          return data.projects[0]?.id ?? "";
        });
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, setStatusMessage]);

  const loadAutomationStatus = useCallback(async () => {
    try {
      const status = await invoke<AutomationStatus>("get_automation_status");
      setAutomation(status);
    } catch {
      setAutomation(null);
    }
  }, []);

  useEffect(() => {
    if (!activeCompanyId) return;
    void loadAutomationStatus();
  }, [activeCompanyId, scrumRevision, loadAutomationStatus]);

  useEffect(() => {
    if (!simulationAutoRun || tab !== "overview" || !activeCompanyId) {
      return;
    }
    void loadSnapshot();
  }, [simulationDay, tab, activeCompanyId, loadSnapshot]);

  const project =
    snapshot?.projects.find((p) => p.id === selectedProjectId) ?? snapshot?.projects[0];
  const directives = snapshot?.directives ?? [];
  const activeSprint = snapshot?.board?.active_sprint ?? null;

  useEffect(() => {
    if (project) {
      setEditProjectDesc(project.description ?? "");
      setEditProjectPriority(project.priority);
      setEditProjectCycle(project.default_cycle_days ?? 14);
      setEditProjectPm(project.pm_agent_id ?? "");
      if (targetType === "project") setTargetRef(project.id);
    }
  }, [project?.id, targetType]);

  const statusFilteredDirectives = useMemo(() => {
    if (directiveFilter === SEARCH_TYPE_ALL) return directives;
    return directives.filter((d) => d.status === directiveFilter || d.source === directiveFilter);
  }, [directives, directiveFilter]);

  const filteredDirectives = useMemo(
    () =>
      filterByQuery(statusFilteredDirectives, debouncedDirectiveQuery, (directive) => [
        directive.title,
        directive.description ?? "",
        directive.status,
        directive.source,
        t(sourceLabelKey(directive.source)),
        directive.target,
        directive.target_ref,
        directive.id,
      ]),
    [statusFilteredDirectives, debouncedDirectiveQuery, t],
  );

  const {
    pageItems: directivePageItems,
    totalPages: directiveTotalPages,
    safePage: directiveSafePage,
  } = useMemo(
    () => paginateItems(filteredDirectives, directiveListPage, 15),
    [filteredDirectives, directiveListPage],
  );

  useEffect(() => {
    setDirectiveListPage(0);
  }, [debouncedDirectiveQuery, directiveFilter, directives.length]);

  const selectedDirective = directives.find((d) => d.id === selectedDirectiveId) ?? null;

  const resolveRouteProjectId = (): string => {
    if (targetType === "project") return targetRef || project?.id || "";
    return project?.id || snapshot?.projects[0]?.id || "";
  };

  const handleSaveDraft = async () => {
    if (directiveTitle.trim().length < 2) {
      setStatusMessage(t("command.enterTitle"));
      return;
    }
    setBusy(true);
    try {
      const ref =
        targetType === "project"
          ? targetRef || project?.id || ""
          : targetType === "department"
            ? targetRef || departments[0]
            : targetRef || agents[0]?.id || "";
      await issueDirective({
        title: directiveTitle.trim(),
        description: directiveBody.trim(),
        target: targetType,
        target_ref: ref,
      });
      setStatusMessage(t("command.draftSaved"));
      setPreview(null);
      await syncScrumSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    const projectId = resolveRouteProjectId();
    if (!projectId) return;
    setBusy(true);
    try {
      let directiveId = selectedDirective?.id;
      if (!directiveId) {
        const ref =
          targetType === "project"
            ? targetRef || projectId
            : targetType === "department"
              ? targetRef || departments[0]
              : targetRef || agents[0]?.id || "";
        const d = await issueDirective({
          title: directiveTitle.trim(),
          description: directiveBody.trim(),
          target: targetType,
          target_ref: ref,
        });
        directiveId = d.id;
        await syncScrumSnapshot();
      }
      const nodes = await previewRouteDirective(directiveId, projectId, useLlm);
      setPreview(nodes);
      setSelectedDirectiveId(directiveId);
      setStatusMessage(t("command.previewReady"));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRoute = async (withPlan = false) => {
    const projectId = resolveRouteProjectId();
    if (!projectId || directiveTitle.trim().length < 2) {
      setStatusMessage(t("command.selectProjectTitle"));
      return;
    }
    setBusy(true);
    try {
      let directiveId = selectedDirective?.id;
      if (!directiveId || selectedDirective?.status !== "open") {
        const ref =
          targetType === "project"
            ? targetRef || projectId
            : targetType === "department"
              ? targetRef || departments[0]
              : targetRef || agents[0]?.id || "";
        const d = await issueDirective({
          title: directiveTitle.trim(),
          description: directiveBody.trim(),
          target: targetType,
          target_ref: ref,
        });
        directiveId = d.id;
      }
      await routeDirective(directiveId, projectId, useLlm, withPlan || planAfterRoute);
      setDirectiveTitle("");
      setDirectiveBody("");
      setPreview(null);
      setStatusMessage(withPlan ? t("command.routedPlanned") : t("command.routed"));
      await syncScrumSnapshot(projectId);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProject = async () => {
    if (newProjectTitle.trim().length < 2) return;
    setBusy(true);
    try {
      const created = await createProject({
        title: newProjectTitle.trim(),
        owner_department: newProjectDept,
        priority: 3,
      });
      setNewProjectTitle("");
      setStatusMessage(`Project created: ${created.title}`);
      setSelectedProjectId(created.id);
      setTargetRef(created.id);
      await syncScrumSnapshot(created.id);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!project) return;
    setBusy(true);
    try {
      await updateProject({
        project_id: project.id,
        description: editProjectDesc,
        priority: editProjectPriority,
        default_cycle_days: editProjectCycle,
        pm_agent_id: editProjectPm || null,
      });
      setStatusMessage(t("command.projectUpdated"));
      await syncScrumSnapshot(project.id);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSprintAction = async (action: "create" | "start" | "plan" | "close") => {
    if (!project) return;
    setBusy(true);
    try {
      let sprintId = project.active_sprint_id;
      if (action === "create") {
        const sprint = await createSprint(
          project.id,
          sprintName || `Sprint ${(snapshot?.board?.active_sprint ? 2 : 1)}`,
          sprintGoal,
          sprintVelocity,
        );
        sprintId = sprint.id;
        setSprintName("");
        setSprintGoal("");
      }
      if (!sprintId && action !== "create") {
        const sprint = await createSprint(project.id, `Sprint 1`, sprintGoal, sprintVelocity);
        sprintId = sprint.id;
      }
      if (action === "start" && sprintId) await startSprint(sprintId);
      if (action === "plan" && sprintId) {
        const n = await planSprint(sprintId);
        setStatusMessage(`Planned — ${n} tasks assigned.`);
      }
      if (action === "close" && sprintId) await closeSprint(sprintId);
      if (action !== "plan") setStatusMessage(`Sprint ${action} complete.`);
      await syncScrumSnapshot(project.id);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const persistSettings = async (patch: Partial<GameSettings>) => {
    const next = await invoke<GameSettings>("update_game_settings", {
      update: {
        scrum_auto_schedule: patch.scrum_auto_schedule,
        scrum_auto_execute: patch.scrum_auto_execute,
        scrum_execution_paused: patch.scrum_execution_paused,
        scrum_min_tokens_guard: patch.scrum_min_tokens_guard,
        scrum_max_executions_per_tick: patch.scrum_max_executions_per_tick,
        scrum_worker_enabled: patch.scrum_worker_enabled,
        scrum_worker_interval_secs: patch.scrum_worker_interval_secs,
        scrum_auto_route: patch.scrum_auto_route,
        scrum_auto_approve: patch.scrum_auto_approve,
        scrum_parallel_agents: patch.scrum_parallel_agents,
        scrum_auto_retry_blocked: patch.scrum_auto_retry_blocked,
        scrum_max_blocked_retries: patch.scrum_max_blocked_retries,
        scrum_use_agent_tools: patch.scrum_use_agent_tools,
        orchestrator_enabled: patch.orchestrator_enabled,
        orchestrator_interval_secs: patch.orchestrator_interval_secs,
        orchestrator_auto_meeting: patch.orchestrator_auto_meeting,
        orchestrator_auto_spawn_co_ceo: patch.orchestrator_auto_spawn_co_ceo,
        orchestrator_max_directives_per_cycle: patch.orchestrator_max_directives_per_cycle,
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
        orchestrator_auto_accept_gigs: patch.orchestrator_auto_accept_gigs,
        orchestrator_max_active_gigs: patch.orchestrator_max_active_gigs,
        orchestrator_auto_start_gigs: patch.orchestrator_auto_start_gigs,
        orchestrator_idle_interval_secs: patch.orchestrator_idle_interval_secs,
        orchestrator_urgent_interval_secs: patch.orchestrator_urgent_interval_secs,
        orchestrator_auto_hub_pull: patch.orchestrator_auto_hub_pull,
        hub_auto_pull_interval_secs: patch.hub_auto_pull_interval_secs,
        orchestrator_auto_complete_gigs: patch.orchestrator_auto_complete_gigs,
        orchestrator_auto_recruit: patch.orchestrator_auto_recruit,
        autopilot_intervention_mode: patch.autopilot_intervention_mode,
        autopilot_full_auto_enabled: patch.autopilot_full_auto_enabled,
        agent_memory_compress_mode: patch.agent_memory_compress_mode,
        agent_memory_compress_every_n_tasks: patch.agent_memory_compress_every_n_tasks,
        agent_memory_max_chars: patch.agent_memory_max_chars,
        agent_memory_append_after_task: patch.agent_memory_append_after_task,
      },
    });
    setSettings(next);
    await syncScrumSnapshot();
    await loadAutomationStatus();
  };

  const handleBatchRun = async () => {
    setBusy(true);
    try {
      const result = await runBatchExecutions();
      setStatusMessage(
        `Batch run: ${result.succeeded}/${result.attempted} succeeded.`,
      );
      await syncScrumSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const commandTabs = [
    ["overview", "command.tab.overview"],
    ["directives", "command.tab.directives"],
    ["co_ceo", "command.tab.co_ceo"],
    ["projects", "command.tab.projects"],
    ["sprint", "command.tab.sprint"],
    ["policies", "command.tab.policies"],
  ] as const;

  const subprocessSelected = isSubprocessRuntime(settings.agent_runtime_mode);

  return (
    <section id="command" className="projects-card command-center" data-projects-section="command">
      <header className="command-center-toolbar">
        <h3 className="command-center-title">{t("command.title")}</h3>
        <nav className="command-center-tabs" aria-label={t("command.tabsAria")}>
          {commandTabs.map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={`command-center-tab${tab === id ? " is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </header>

      <div className="command-center-body">
        {tab === "overview" && !overview ? (
          <p className="muted">{t("command.loadingOverview")}</p>
        ) : null}
        {tab === "overview" && overview ? (
          <div className="command-overview">
            <div className="command-panel-block autopilot-panel-block">
              <h4 className="command-panel-heading">{t("command.autopilotHeading")}</h4>
              <AutopilotPipelinePanel onJumpToSection={onJumpToSection} />
            </div>
            <div className="command-kpi-strip">
              {showSimulationChrome ? (
                <>
                  <article className="command-kpi">
                    <span className="command-kpi-label">{t("command.day")}</span>
                    <strong className="command-kpi-value">{overview.day_number}</strong>
                  </article>
                  <article className="command-kpi">
                    <span className="command-kpi-label">{t("command.kpi.teamMorale")}</span>
                    <strong className="command-kpi-value">{(overview.avg_morale * 100).toFixed(0)}%</strong>
                  </article>
                </>
              ) : null}
              <article className="command-kpi">
                <span className="command-kpi-label">{t("command.kpi.tokenPool")}</span>
                <strong className="command-kpi-value">{overview.token_pool.toLocaleString()}</strong>
              </article>
              <article className="command-kpi">
                <span className="command-kpi-label">{t("command.kpi.monthlyBurn")}</span>
                <strong className="command-kpi-value">{overview.monthly_burn.toLocaleString()}</strong>
              </article>
              <article className="command-kpi">
                <span className="command-kpi-label">{t("command.kpi.payroll")}</span>
                <strong className="command-kpi-value">{overview.monthly_payroll.toLocaleString()}</strong>
              </article>
              <article className="command-kpi">
                <span className="command-kpi-label">{t("command.kpi.openDirectives")}</span>
                <strong className="command-kpi-value">{overview.open_directives}</strong>
              </article>
              <article className="command-kpi command-kpi--wide">
                <span className="command-kpi-label">{t("command.kpi.sprint")}</span>
                <strong className="command-kpi-value">{overview.active_sprint_name ?? "—"}</strong>
                <span className="command-kpi-sub">
                  {t("command.ptsLeft", {
                    remaining: overview.burndown_remaining,
                    total: overview.burndown_total,
                  })}
                </span>
              </article>
            </div>
            <div className="command-overview-columns">
              <div className="command-readiness-checklist command-panel-block">
                <h4 className="command-panel-heading">
                  {t("command.automationReadiness")}{" "}
                  {automation?.readiness?.ready ? (
                    <span className="command-readiness-ok">{t("command.ready")}</span>
                  ) : (
                    <span className="command-readiness-warn">{t("command.setupNeeded")}</span>
                  )}
                  {automation?.readiness?.autopilot_phase ? (
                    <span className="command-readiness-phase">
                      · {t("command.phase", { phase: autopilotPhaseLabel(t, automation.readiness.autopilot_phase) })}
                    </span>
                  ) : null}
                </h4>
                <ul className="command-readiness-list">
                  {(automation?.readiness?.items ?? []).map((item) => (
                    <li
                      key={item.id}
                      className={item.ok ? "command-readiness-item--ok" : "command-readiness-item--warn"}
                    >
                      <strong>{readinessLabel(t, item)}</strong>
                      <span className="command-readiness-detail">{readinessDetail(t, item)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="command-alerts command-panel-block">
                <h4 className="command-panel-heading">{t("command.alerts")}</h4>
                {overview.alerts.length === 0 ? (
                  <p className="command-empty-hint">{t("command.noAlerts")}</p>
                ) : (
                  <ul className="command-alert-list">
                    {overview.alerts.map((alert, i) => (
                      <li key={i} className={`command-alert command-alert--${alert.severity}`}>
                        <span className="command-alert-text">{alertMessage(t, alert)}</span>
                        {alert.action_ref && onJumpToSection ? (
                          <button
                            type="button"
                            className="command-alert-jump"
                            onClick={() => onJumpToSection(alert.action_ref!.includes("dir-") ? "directives" : alert.action_ref!)}
                          >
                            {t("command.view")}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="command-automation-log command-panel-block">
              <div className="command-panel-heading-row">
                <h4 className="command-panel-heading">{t("command.automationActivity")}</h4>
                <button
                  type="button"
                  className="command-inline-link"
                  onClick={() => useGameStore.getState().setActivePanel("observatory")}
                >
                  {t("command.openObservatory")}
                </button>
              </div>
              <dl className="command-automation-meta">
                <div className="command-automation-meta-item">
                  <dt>{t("command.directivesIssued")}</dt>
                  <dd>{automation?.orchestrator_directives_total ?? 0}</dd>
                </div>
                <div className="command-automation-meta-item">
                  <dt>{t("command.hubQueue")}</dt>
                  <dd>{automation?.sync_queue_pending ?? 0}</dd>
                </div>
                <div className="command-automation-meta-item">
                  <dt>{t("command.parallelLlm")}</dt>
                  <dd>{automation?.parallel_llm_enabled ? t("coCeo.on") : t("coCeo.off")}</dd>
                </div>
                {automation?.autopilot ? (
                  <>
                    <div className="command-automation-meta-item">
                      <dt>{t("command.autopilotPhase")}</dt>
                      <dd>{autopilotPhaseLabel(t, automation.autopilot.phase, automation.autopilot.phase_label)}</dd>
                    </div>
                    <div className="command-automation-meta-item">
                      <dt>{t("command.deliverablesWeek")}</dt>
                      <dd>{automation.autopilot.deliverables_this_week}</dd>
                    </div>
                    {automation.autopilot.gigs_advanced_this_week > 0 ? (
                      <div className="command-automation-meta-item">
                        <dt>{t("command.gigsAdvanced")}</dt>
                        <dd>{automation.autopilot.gigs_advanced_this_week}</dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="command-automation-meta-item command-automation-meta-item--time">
                  <dt>{t("command.workerTick")}</dt>
                  <dd title={automation?.scrum_worker_last_tick_at ?? undefined}>
                    {formatTimestamp(automation?.scrum_worker_last_tick_at, "compact")}
                  </dd>
                </div>
                <div className="command-automation-meta-item command-automation-meta-item--time">
                  <dt>{t("command.orchestrator")}</dt>
                  <dd title={automation?.orchestrator_last_tick_at ?? undefined}>
                    {formatTimestamp(automation?.orchestrator_last_tick_at, "compact")}
                  </dd>
                </div>
                <div className="command-automation-meta-item command-automation-meta-item--time">
                  <dt>{t("command.hubPull")}</dt>
                  <dd title={automation?.hub_last_pull_at ?? undefined}>
                    {formatTimestamp(automation?.hub_last_pull_at, "compact")}
                  </dd>
                </div>
                <div className="command-automation-meta-item command-automation-meta-item--wide">
                  <dt>{t("command.agentRuntime")}</dt>
                  <dd title={
                    subprocessSelected
                      ? automation?.openclaw_available
                        ? automation.openclaw_version ?? t("autopilot.ready")
                        : automation?.openclaw_message ?? undefined
                      : undefined
                  }>
                    {subprocessSelected
                      ? automation?.openclaw_available
                        ? `${runtimeModeLabel(settings.agent_runtime_mode)} · ${automation.openclaw_version ?? t("autopilot.ready")}`
                        : `${runtimeModeLabel(settings.agent_runtime_mode)} · ${automation?.openclaw_message ?? "—"}`
                      : runtimeModeLabel(settings.agent_runtime_mode)}
                  </dd>
                </div>
              </dl>
              {(automation?.scrum_worker_log.length ?? 0) > 0 ? (
                <ul className="command-activity-list">
                  {automation?.scrum_worker_log.slice(-6).map((line) => (
                    <li key={line}>{workerLogLine(t, line)}</li>
                  ))}
                </ul>
              ) : (
                <p className="command-empty-hint">{t("command.noWorkerLog")}</p>
              )}
            </div>
          </div>
        ) : null}

        {tab === "co_ceo" ? (
          <CoCeoPanel onChanged={() => void syncScrumSnapshot()} />
        ) : null}

        {tab === "directives" ? (
          <div className="command-directives-layout">
            <aside className="command-inbox-sidebar command-panel-block">
              <h4 className="command-panel-heading">{t("command.directiveInbox")}</h4>
              <SearchableListToolbar
                query={directiveSearchQuery}
                onQueryChange={setDirectiveSearchQuery}
                placeholder={t("command.searchDirectives")}
                ariaLabel={t("command.searchDirectives")}
                matchCount={
                  debouncedDirectiveQuery.trim() || directiveFilter !== SEARCH_TYPE_ALL
                    ? filteredDirectives.length
                    : undefined
                }
                totalCount={statusFilteredDirectives.length}
                typeFilter={{
                  value: directiveFilter,
                  onChange: setDirectiveFilter,
                  options: DIRECTIVE_SEARCH_TYPES,
                  ariaLabel: t("command.filterDirectiveStatus"),
                  label: t("command.filterStatus"),
                }}
              />
              {debouncedDirectiveQuery.trim() && filteredDirectives.length === 0 ? (
                <p className="search-empty-hint command-empty-hint">
                  {t("command.noMatches", { query: debouncedDirectiveQuery })}
                </p>
              ) : null}
              <ul className="command-directive-list">
                {directivePageItems.map((d: Directive) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`command-directive-row${selectedDirectiveId === d.id ? " active" : ""}`}
                      onClick={() => {
                        setSelectedDirectiveId(d.id);
                        setDirectiveTitle(d.title);
                        setDirectiveBody(d.description);
                      }}
                    >
                      <span className="command-directive-row-top">
                        <span className="command-source-pill">{t(sourceLabelKey(d.source))}</span>
                        <span className="command-directive-status">{d.status}</span>
                      </span>
                      <strong className="command-directive-title">{d.title}</strong>
                      <span className="command-directive-meta">
                        {t("command.nodesCount", { n: d.spawned_node_ids.length })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <PaginationBar
                page={directiveSafePage}
                totalPages={directiveTotalPages}
                label={t("command.directives")}
                onPageChange={setDirectiveListPage}
              />
            </aside>

            <div className="command-directives-main">
              <div className="command-composer command-form-section">
                <h4 className="command-panel-heading">{t("command.newDirective")}</h4>
                <div className="command-form command-form--compact">
                  <div className="command-template-row">
                    {DIRECTIVE_TEMPLATE_KEYS.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setDirectiveTitle(t(tpl.titleKey));
                          setDirectiveBody(t(tpl.bodyKey));
                        }}
                      >
                        {t(tpl.labelKey)}
                      </button>
                    ))}
                  </div>
                  <div className="command-form-grid">
                    <label className="field-label">
                      {t("command.targetType")}
                      <select value={targetType} onChange={(e) => setTargetType(e.target.value as DirectiveTarget)}>
                        <option value="project">{t("command.target.project")}</option>
                        <option value="department">{t("command.target.department")}</option>
                        <option value="agent">{t("command.target.agent")}</option>
                      </select>
                    </label>
                    <label className="field-label">
                      {t("command.target")}
                      <select value={targetRef} onChange={(e) => setTargetRef(e.target.value)}>
                        {targetType === "project"
                          ? (snapshot?.projects ?? []).map((p: InternalProject) => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))
                          : targetType === "department"
                            ? departments.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))
                            : agents.map((a) => (
                                <option key={a.id} value={a.id}>{formatAgentOptionLabel(a)}</option>
                              ))}
                      </select>
                    </label>
                    <label className="field-label command-form-grid-span2">
                      {t("command.directiveTitle")}
                      <input value={directiveTitle} onChange={(e) => setDirectiveTitle(e.target.value)} />
                    </label>
                    <label className="field-label command-form-grid-span2">
                      {t("command.directiveDetails")}
                      <textarea value={directiveBody} onChange={(e) => setDirectiveBody(e.target.value)} rows={2} />
                    </label>
                  </div>
                  <div className="command-form-options">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                      <span>{t("command.llmDecomp")}</span>
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={planAfterRoute} onChange={(e) => setPlanAfterRoute(e.target.checked)} />
                      <span>{t("command.planAfterRoute")}</span>
                    </label>
                  </div>
                  <div className="panel-actions command-panel-actions">
                    <button type="button" disabled={busy} onClick={() => void handleSaveDraft()}>
                      {t("command.saveDraft")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handlePreview()}>
                      {t("command.preview")}
                    </button>
                    <button type="button" className="primary-action" disabled={busy} onClick={() => void handleRoute(false)}>
                      {t("command.route")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handleRoute(true)}>
                      {t("command.routePlan")}
                    </button>
                  </div>
                  {preview && preview.length > 0 ? (
                    <div className="command-preview-box">
                      <h5>{t("command.previewDecomp")}</h5>
                      <PreviewTree nodes={preview} />
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedDirective ? (
                <div className="command-directive-detail command-panel-block">
                  <h4 className="command-panel-heading">{selectedDirective.title}</h4>
                  <p className="command-directive-detail-body">
                    {selectedDirective.description || t("command.noDetails")}
                  </p>
                  <p className="command-directive-detail-meta">
                    {t(sourceLabelKey(selectedDirective.source))} · {selectedDirective.status} ·{" "}
                    {t("command.targetMeta", {
                      target: selectedDirective.target,
                      ref: selectedDirective.target_ref,
                    })}
                  </p>
                  <div className="panel-actions command-panel-actions">
                    {selectedDirective.status === "open" ? (
                      <button type="button" disabled={busy} onClick={() => void handleRoute(planAfterRoute)}>
                        {t("command.route")}
                      </button>
                    ) : null}
                    {selectedDirective.status !== "cancelled" && selectedDirective.status !== "done" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void cancelDirective(selectedDirective.id).then(() => syncScrumSnapshot())}
                      >
                        {t("command.cancel")}
                      </button>
                    ) : null}
                    {selectedDirective.status === "routed" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updateDirectiveStatus(selectedDirective.id, "done").then(() => syncScrumSnapshot())
                        }
                      >
                        {t("command.markDone")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="command-empty-hint command-directive-placeholder">
                  {t("command.selectDirective")}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {tab === "projects" ? (
          <div className="command-projects-layout">
            <section className="command-form-section">
              <h4>{t("command.createProject")}</h4>
              <div className="command-form">
                <label className="field-label">
                  {t("common.title")}
                  <input value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} />
                </label>
                <label className="field-label">
                  {t("command.department")}
                  <select value={newProjectDept} onChange={(e) => setNewProjectDept(e.target.value)}>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy}
                    onClick={() => void handleCreateProject()}
                  >
                    {t("command.create")}
                  </button>
                </div>
              </div>
            </section>
            {project ? (
              <section className="command-form-section">
                <h4>{t("command.editProject", { title: project.title })}</h4>
                <div className="command-form">
                  <label className="field-label">
                    {t("command.activeProject")}
                    <select
                      value={selectedProjectId || project.id}
                      onChange={(e) => handleProjectSelect(e.target.value)}
                    >
                      {(snapshot?.projects ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    {t("common.description")}
                    <textarea value={editProjectDesc} onChange={(e) => setEditProjectDesc(e.target.value)} rows={2} />
                  </label>
                  <label className="field-label">
                    {t("command.priority")}
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={editProjectPriority}
                      onChange={(e) => setEditProjectPriority(Number(e.target.value))}
                    />
                  </label>
                  <label className="field-label">
                    {t("command.sprintCycle")}
                    <input
                      type="number"
                      min={1}
                      value={editProjectCycle}
                      onChange={(e) => setEditProjectCycle(Number(e.target.value))}
                    />
                  </label>
                  <label className="field-label">
                    {t("command.projectPm")}
                    <select value={editProjectPm} onChange={(e) => setEditProjectPm(e.target.value)}>
                      <option value="">{t("command.inheritPm")}</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{formatAgentOptionLabel(a)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    {t("command.globalPm")}
                    <select
                      value={snapshot?.default_pm_agent_id ?? ""}
                      onChange={(e) => void setDefaultPmAgent(e.target.value || null).then(() => syncScrumSnapshot())}
                    >
                      <option value="">{t("command.autoDetect")}</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{formatAgentOptionLabel(a)}</option>
                      ))}
                    </select>
                  </label>
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="primary-action"
                      disabled={busy}
                      onClick={() => void handleUpdateProject()}
                    >
                      {t("command.saveProject")}
                    </button>
                  </div>
                  <p className="muted command-form-note">
                    {t("command.progress", { pct: (project.progress * 100).toFixed(0) })}
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "sprint" ? (
          <div className="command-sprint-layout">
            <section className="command-form-section">
              {activeSprint ? (
                <div className="command-sprint-active">
                  <h4 className="command-panel-heading">
                    {activeSprint.name} · {activeSprint.status}
                  </h4>
                  <p className="command-sprint-goal">
                    {activeSprint.goal || t("command.noSprintGoal")}
                  </p>
                  <p className="command-sprint-meta">
                    {showSimulationChrome ? t("command.day") : t("command.window")}{" "}
                    {activeSprint.start_day}–{activeSprint.end_day} · velocity{" "}
                    {activeSprint.velocity_target}
                  </p>
                </div>
              ) : (
                <p className="command-empty-hint">{t("command.noActiveSprint")}</p>
              )}
              <div className="command-form">
                <label className="field-label">
                  {t("command.sprintName")}
                  <input value={sprintName} onChange={(e) => setSprintName(e.target.value)} placeholder={t("command.sprintPh")} />
                </label>
                <label className="field-label">
                  {t("command.goal")}
                  <input value={sprintGoal} onChange={(e) => setSprintGoal(e.target.value)} />
                </label>
                <label className="field-label">
                  {t("command.velocity")}
                  <input
                    type="number"
                    min={1}
                    value={sprintVelocity}
                    onChange={(e) => setSprintVelocity(Number(e.target.value))}
                  />
                </label>
                <div className="panel-actions">
                  <button type="button" disabled={busy} onClick={() => void handleSprintAction("create")}>
                    {t("command.createSprint")}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void handleSprintAction("start")}>
                    {t("command.start")}
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy}
                    onClick={() => void handleSprintAction("plan")}
                  >
                    {t("command.planSprint")}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void handleSprintAction("close")}>
                    {t("command.closeSprint")}
                  </button>
                </div>
              </div>
            </section>
            <div className="command-capacity command-panel-block">
              <h4 className="command-panel-heading">{t("command.teamCapacity")}</h4>
              <div className="command-capacity-grid">
                {(snapshot?.inboxes ?? []).map((entry) => (
                  <article key={entry.agent_id} className="command-capacity-card">
                    <strong>{entry.agent_name}</strong>
                    <p className="command-capacity-meta">
                      {entry.agent_role} · {entry.department} · {entry.assigned_points} pts
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "policies" ? (
          <section className="command-policies">
            <h4 className="command-panel-heading">{t("command.executionPolicies")}</h4>
            <p className="muted command-form-note command-policies-ownership">
              {t("command.policiesOwnershipBefore")}{" "}
              <button type="button" className="command-inline-link" onClick={() => setTab("overview")}>
                {t("command.tab.overview")}
              </button>{" "}
              {t("command.policiesOwnershipMid")}{" "}
              <button
                type="button"
                className="command-inline-link"
                onClick={() => useGameStore.getState().setActivePanel("agents")}
              >
                {t("nav.agents")} → {t("agents.section.runtime")}
              </button>
              {t("command.policiesOwnershipEnd")}
            </p>
            <div className="command-policies-grid">
            <div className="command-policy-group command-panel-block">
              <h5 className="command-policy-group-title">{t("command.policy.scrum")}</h5>
              <div className="command-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_schedule ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_schedule: e.target.checked })}
              />
              <span>{t("command.policy.autoSchedule")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_worker_enabled ?? true}
                onChange={(e) => void persistSettings({ scrum_worker_enabled: e.target.checked })}
              />
              <span>{t("command.policy.scrumWorker")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_route ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_route: e.target.checked })}
              />
              <span>{t("command.policy.autoRoute")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_approve ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_approve: e.target.checked })}
              />
              <span>{t("command.policy.autoApprove")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_execute ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_execute: e.target.checked })}
              />
              <span>{t("command.policy.autoExecute")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_parallel_agents ?? false}
                onChange={(e) => void persistSettings({ scrum_parallel_agents: e.target.checked })}
              />
              <span>{t("command.policy.parallelAgents")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_retry_blocked ?? true}
                onChange={(e) =>
                  void persistSettings({ scrum_auto_retry_blocked: e.target.checked })
                }
              />
              <span>{t("command.policy.autoRetry")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_use_agent_tools ?? false}
                onChange={(e) => void persistSettings({ scrum_use_agent_tools: e.target.checked })}
              />
              <span>{t("command.policy.agentTools")}</span>
            </label>
              </div>
            </div>
            <div className="command-policy-group command-panel-block">
              <h5 className="command-policy-group-title">{t("command.policy.orchestrator")}</h5>
              <div className="command-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_enabled ?? true}
                onChange={(e) => void persistSettings({ orchestrator_enabled: e.target.checked })}
              />
              <span>{t("command.policy.strategicLoop")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_meeting ?? true}
                onChange={(e) => void persistSettings({ orchestrator_auto_meeting: e.target.checked })}
              />
              <span>{t("command.policy.autoMeeting")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_spawn_co_ceo ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_spawn_co_ceo: e.target.checked })
                }
              />
              <span>{t("command.policy.autoSpawnCoCeo")}</span>
            </label>
            <label className="field-label">
              {t("command.policy.orchIntervalActive")}
              <input
                type="number"
                min={60}
                max={86400}
                value={settings.orchestrator_interval_secs ?? 3600}
                onChange={(e) =>
                  void persistSettings({ orchestrator_interval_secs: Number(e.target.value) })
                }
              />
            </label>
            <label className="field-label">
              {t("command.policy.orchIntervalIdle")}
              <input
                type="number"
                min={60}
                max={86400}
                value={settings.orchestrator_idle_interval_secs ?? 600}
                onChange={(e) =>
                  void persistSettings({ orchestrator_idle_interval_secs: Number(e.target.value) })
                }
              />
            </label>
            <label className="field-label">
              {t("command.policy.orchIntervalUrgent")}
              <input
                type="number"
                min={60}
                max={86400}
                value={settings.orchestrator_urgent_interval_secs ?? 300}
                onChange={(e) =>
                  void persistSettings({ orchestrator_urgent_interval_secs: Number(e.target.value) })
                }
              />
            </label>
            <label className="field-label">
              {t("command.policy.maxDirectives")}
              <input
                type="number"
                min={1}
                max={5}
                value={settings.orchestrator_max_directives_per_cycle ?? 1}
                onChange={(e) =>
                  void persistSettings({
                    orchestrator_max_directives_per_cycle: Number(e.target.value),
                  })
                }
              />
            </label>
              </div>
            </div>
            <div className="command-policy-group command-panel-block">
              <h5 className="command-policy-group-title">{t("command.policy.marketplace")}</h5>
              <div className="command-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_hub_pull ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_hub_pull: e.target.checked })
                }
              />
              <span>{t("command.policy.autoHubPull")}</span>
            </label>
            <label className="field-label">
              {t("command.policy.hubPullInterval")}
              <input
                type="number"
                min={60}
                max={86400}
                value={settings.hub_auto_pull_interval_secs ?? 300}
                onChange={(e) =>
                  void persistSettings({ hub_auto_pull_interval_secs: Number(e.target.value) })
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_accept_gigs ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_accept_gigs: e.target.checked })
                }
              />
              <span>{t("command.policy.autoAcceptGigs")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_start_gigs ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_start_gigs: e.target.checked })
                }
              />
              <span>{t("command.policy.autoStartGigs")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_complete_gigs ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_complete_gigs: e.target.checked })
                }
              />
              <span>{t("command.policy.autoCompleteGigs")}</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_recruit ?? false}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_recruit: e.target.checked })
                }
              />
              <span>{t("command.policy.autoRecruit")}</span>
            </label>
            <label className="field-label">
              {t("command.policy.maxActiveGigs")}
              <input
                type="number"
                min={1}
                max={10}
                value={settings.orchestrator_max_active_gigs ?? 3}
                onChange={(e) =>
                  void persistSettings({ orchestrator_max_active_gigs: Number(e.target.value) })
                }
              />
            </label>
              </div>
            </div>
            <div className="command-policy-group command-panel-block">
              <h5 className="command-policy-group-title">{t("command.policy.executionQueue")}</h5>
              <div className="command-form">
                <p className="muted command-form-note">{t("command.policy.pauseNote")}</p>
                <label className="field-label">
                  {t("command.policy.minTokenGuard")}
                  <input
                    type="number"
                    min={0}
                    value={settings.scrum_min_tokens_guard ?? 0}
                    onChange={(e) =>
                      void persistSettings({ scrum_min_tokens_guard: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="field-label">
                  {t("command.policy.maxExecBatch")}
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.scrum_max_executions_per_tick ?? 1}
                    onChange={(e) =>
                      void persistSettings({ scrum_max_executions_per_tick: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="field-label">
                  {t("command.policy.workerInterval")}
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={settings.scrum_worker_interval_secs ?? 30}
                    onChange={(e) =>
                      void persistSettings({ scrum_worker_interval_secs: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="field-label">
                  {t("command.policy.maxBlockedRetries")}
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={settings.scrum_max_blocked_retries ?? 2}
                    onChange={(e) =>
                      void persistSettings({ scrum_max_blocked_retries: Number(e.target.value) })
                    }
                  />
                </label>
                <h5 className="command-policy-group-title">{t("command.policy.agentMemory")}</h5>
                <p className="muted command-form-note">{t("command.policy.memoryNote")}</p>
                <label className="field-label">
                  {t("command.policy.compressMode")}
                  <select
                    value={settings.agent_memory_compress_mode ?? "hybrid"}
                    onChange={(e) =>
                      void persistSettings({ agent_memory_compress_mode: e.target.value })
                    }
                  >
                    <option value="hybrid">{t("command.policy.compressHybrid")}</option>
                    <option value="every_n_tasks">{t("command.policy.compressEveryN")}</option>
                    <option value="every_task">{t("command.policy.compressEveryTask")}</option>
                    <option value="size_threshold">{t("command.policy.compressSize")}</option>
                  </select>
                </label>
                <label className="field-label">
                  {t("command.policy.compressEveryNLabel")}
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={settings.agent_memory_compress_every_n_tasks ?? 3}
                    onChange={(e) =>
                      void persistSettings({
                        agent_memory_compress_every_n_tasks: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  {t("command.policy.maxMemoryChars")}
                  <input
                    type="number"
                    min={500}
                    max={20000}
                    step={100}
                    value={settings.agent_memory_max_chars ?? 4000}
                    onChange={(e) =>
                      void persistSettings({ agent_memory_max_chars: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={settings.agent_memory_append_after_task ?? true}
                    onChange={(e) =>
                      void persistSettings({ agent_memory_append_after_task: e.target.checked })
                    }
                  />
                  <span>{t("command.policy.appendMemory")}</span>
                </label>
                <p className="command-form-note">
                  {t("command.tokensInflow", {
                    n: finance.monthly_inflow_tokens.toLocaleString(),
                  })}
                </p>
                <div className="panel-actions command-panel-actions">
                  <button type="button" className="primary-action" disabled={busy} onClick={() => void handleBatchRun()}>
                    {t("command.runBatch")}
                  </button>
                </div>
              </div>
            </div>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

