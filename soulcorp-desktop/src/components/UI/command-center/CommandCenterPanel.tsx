import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showSimulationChrome, simulationAutoRun } from "../../../config/features";
import { useGameStore } from "../../../stores/gameStore";
import type {
  AutomationStatus,
  OpenClawStatus,
  OpenClawTestResult,
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
import { filterByQuery } from "../../../utils/listSearch";
import { paginateItems } from "../../../utils/pagination";
import { notifyScrumChanged } from "../../../utils/scrumSync";
import { useCompanyDepartments } from "../../../hooks/useCompanyDepartments";
import { PaginationBar } from "../PaginationBar";
import { SearchableListToolbar } from "../SearchableListToolbar";
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

const DIRECTIVE_TEMPLATES = [
  { label: "Ship feature", title: "Ship feature", body: "Deliver a shippable increment this sprint." },
  { label: "Fix production", title: "Fix production issue", body: "Resolve critical bug and document root cause." },
  { label: "Research spike", title: "Research spike", body: "Investigate options and produce recommendation doc." },
  { label: "Hire & onboard", title: "Hire and onboard", body: "Recruit and onboard agent for upcoming workload." },
  { label: "Cost reduction", title: "Reduce token burn", body: "Optimize workflows to lower LLM token usage." },
] as const;

type CommandTab = "overview" | "directives" | "co_ceo" | "projects" | "sprint" | "policies";

interface CommandCenterPanelProps {
  onJumpToSection?: (sectionId: string) => void;
}

function sourceLabel(source: string): string {
  switch (source) {
    case "meeting":
      return "Meeting";
    case "co_ceo":
      return "Co-CEO";
    case "marketplace":
      return "Marketplace";
    default:
      return "CEO";
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
  const [openclawStatus, setOpenclawStatus] = useState<OpenClawStatus | null>(null);
  const [openclawTesting, setOpenclawTesting] = useState(false);

  const [directiveTitle, setDirectiveTitle] = useState("");
  const [directiveBody, setDirectiveBody] = useState("");
  const [targetType, setTargetType] = useState<DirectiveTarget>("project");
  const [targetRef, setTargetRef] = useState("");
  const [useLlm, setUseLlm] = useState(true);
  const [planAfterRoute, setPlanAfterRoute] = useState(false);
  const [preview, setPreview] = useState<DirectivePreviewNode[] | null>(null);
  const [selectedDirectiveId, setSelectedDirectiveId] = useState<string | null>(null);
  const [directiveFilter, setDirectiveFilter] = useState<string>("all");
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

  const loadSnapshot = useCallback(
    async (projectId?: string) => {
      const pid = projectId || selectedProjectId || undefined;
      try {
        const [data, ov] = await Promise.all([
          getScrumSnapshot(pid),
          getCommandCenterOverview(pid),
        ]);
        setSnapshot(data);
        setOverview(ov);
      } catch (error) {
        setStatusMessage(String(error));
      }
    },
    [selectedProjectId, setStatusMessage],
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
    void loadSnapshot(selectedProjectId || undefined);
  }, [scrumRevision, activeCompanyId, selectedProjectId, loadSnapshot]);

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
        const firstProjectId = data.projects[0]?.id ?? "";
        setSelectedProjectId(firstProjectId);
        setTargetRef(firstProjectId);
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
      const [status, openclaw] = await Promise.all([
        invoke<AutomationStatus>("get_automation_status"),
        invoke<OpenClawStatus>("get_openclaw_status"),
      ]);
      setAutomation(status);
      setOpenclawStatus(openclaw);
    } catch {
      setAutomation(null);
      setOpenclawStatus(null);
    }
  }, []);

  const testOpenclaw = useCallback(async () => {
    setOpenclawTesting(true);
    try {
      const result = await invoke<OpenClawTestResult>("test_openclaw_runtime", {
        request: {},
      });
      setStatusMessage(result.message);
      await loadAutomationStatus();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setOpenclawTesting(false);
    }
  }, [loadAutomationStatus, setStatusMessage]);

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
    if (directiveFilter === "all") return directives;
    return directives.filter((d) => d.status === directiveFilter || d.source === directiveFilter);
  }, [directives, directiveFilter]);

  const filteredDirectives = useMemo(
    () =>
      filterByQuery(statusFilteredDirectives, debouncedDirectiveQuery, (directive) => [
        directive.title,
        directive.description ?? "",
        directive.status,
        directive.source,
        sourceLabel(directive.source),
        directive.target,
        directive.target_ref,
        directive.id,
      ]),
    [statusFilteredDirectives, debouncedDirectiveQuery],
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
      setStatusMessage("Enter a directive title.");
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
      setStatusMessage("Directive saved as draft.");
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
      setStatusMessage("Decomposition preview ready.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRoute = async (withPlan = false) => {
    const projectId = resolveRouteProjectId();
    if (!projectId || directiveTitle.trim().length < 2) {
      setStatusMessage("Select project and enter directive title.");
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
      setStatusMessage(withPlan ? "Directive routed and sprint planned." : "Directive routed.");
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
      setStatusMessage("Project updated.");
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
        orchestrator_auto_accept_gigs: patch.orchestrator_auto_accept_gigs,
        orchestrator_max_active_gigs: patch.orchestrator_max_active_gigs,
        orchestrator_auto_start_gigs: patch.orchestrator_auto_start_gigs,
        orchestrator_idle_interval_secs: patch.orchestrator_idle_interval_secs,
        orchestrator_urgent_interval_secs: patch.orchestrator_urgent_interval_secs,
        orchestrator_auto_hub_pull: patch.orchestrator_auto_hub_pull,
        hub_auto_pull_interval_secs: patch.hub_auto_pull_interval_secs,
        orchestrator_auto_complete_gigs: patch.orchestrator_auto_complete_gigs,
        orchestrator_auto_recruit: patch.orchestrator_auto_recruit,
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

  return (
    <section id="command" className="projects-card command-center" data-projects-section="command">
      <header className="projects-card-header">
        <h3>Command Center</h3>
        <p className="muted">Directives, projects, sprint, policies.</p>
      </header>

      <nav className="app-page-nav app-page-nav--inline command-center-tabs" aria-label="Command Center sections">
        {(
          [
            ["overview", "Overview"],
            ["directives", "Directives"],
            ["co_ceo", "Co-CEO"],
            ["projects", "Projects"],
            ["sprint", "Sprint"],
            ["policies", "Policies"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`app-page-nav-btn${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            <span className="app-page-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="projects-card-body command-center-body">
        {tab === "overview" && !overview ? (
          <p className="muted">Loading company overview…</p>
        ) : null}
        {tab === "overview" && overview ? (
          <div className="command-overview-grid">
            {showSimulationChrome ? (
              <>
                <article className="command-stat-card">
                  <span className="muted">Day</span>
                  <strong>{overview.day_number}</strong>
                </article>
                <article className="command-stat-card">
                  <span className="muted">Team morale</span>
                  <strong>{(overview.avg_morale * 100).toFixed(0)}%</strong>
                </article>
              </>
            ) : null}
            <article className="command-stat-card">
              <span className="muted">Token pool</span>
              <strong>{overview.token_pool.toLocaleString()}</strong>
            </article>
            <article className="command-stat-card">
              <span className="muted">Monthly burn</span>
              <strong>{overview.monthly_burn.toLocaleString()}</strong>
            </article>
            <article className="command-stat-card">
              <span className="muted">Monthly payroll</span>
              <strong>{overview.monthly_payroll.toLocaleString()}</strong>
            </article>
            <article className="command-stat-card">
              <span className="muted">Open directives</span>
              <strong>{overview.open_directives}</strong>
            </article>
            <article className="command-stat-card">
              <span className="muted">Sprint</span>
              <strong>{overview.active_sprint_name ?? "—"}</strong>
              <span className="muted">
                {overview.burndown_remaining}/{overview.burndown_total} pts left
              </span>
            </article>
            <div className="command-readiness-checklist">
              <h4>
                Automation readiness{" "}
                {automation?.readiness?.ready ? (
                  <span className="command-readiness-ok">Ready</span>
                ) : (
                  <span className="command-readiness-warn">Setup needed</span>
                )}
              </h4>
              <ul className="command-readiness-list">
                {(automation?.readiness?.items ?? []).map((item) => (
                  <li
                    key={item.id}
                    className={item.ok ? "command-readiness-item--ok" : "command-readiness-item--warn"}
                  >
                    <strong>{item.label}</strong>
                    <span className="muted">{item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="command-automation-log">
              <h4>Automation activity</h4>
              <p className="muted">
                Worker last tick: {automation?.scrum_worker_last_tick_at ?? "—"} · Orchestrator:{" "}
                {automation?.orchestrator_last_tick_at ?? "—"} · Directives issued:{" "}
                {automation?.orchestrator_directives_total ?? 0} · Hub queue:{" "}
                {automation?.sync_queue_pending ?? 0} · Hub pull:{" "}
                {automation?.hub_last_pull_at ?? "—"}
                {automation?.parallel_llm_enabled ? " · Parallel LLM: on" : ""}
                {automation?.openclaw_available
                  ? ` · OpenClaw: ${automation.openclaw_version ?? "ready"}`
                  : automation?.openclaw_message
                    ? ` · OpenClaw: ${automation.openclaw_message}`
                    : ""}
              </p>
              {(automation?.scrum_worker_log.length ?? 0) > 0 ? (
                <ul className="command-activity-list">
                  {automation?.scrum_worker_log.slice(-8).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Background worker has not logged activity yet.</p>
              )}
            </div>
            <div className="command-alerts">
              <h4>Alerts</h4>
              {overview.alerts.length === 0 ? (
                <p className="muted">No alerts — operations nominal.</p>
              ) : (
                <ul>
                  {overview.alerts.map((alert, i) => (
                    <li key={i} className={`command-alert command-alert--${alert.severity}`}>
                      {alert.message}
                      {alert.action_ref && onJumpToSection ? (
                        <button
                          type="button"
                          className="command-alert-jump"
                          onClick={() => onJumpToSection(alert.action_ref!.includes("dir-") ? "directives" : alert.action_ref!)}
                        >
                          View
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === "co_ceo" ? (
          <CoCeoPanel onChanged={() => void syncScrumSnapshot()} />
        ) : null}

        {tab === "directives" ? (
          <div className="command-directives-layout">
            <div className="command-composer command-form-section">
              <h4>Directive Composer</h4>
              <div className="command-form">
                <div className="command-template-row">
                {DIRECTIVE_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => {
                      setDirectiveTitle(t.title);
                      setDirectiveBody(t.body);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
                </div>
                <label className="field-label">
                Target type
                <select value={targetType} onChange={(e) => setTargetType(e.target.value as DirectiveTarget)}>
                  <option value="project">Project</option>
                  <option value="department">Department</option>
                  <option value="agent">Agent</option>
                </select>
              </label>
              <label className="field-label">
                Target
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
              <label className="field-label">
                Title
                <input value={directiveTitle} onChange={(e) => setDirectiveTitle(e.target.value)} />
              </label>
              <label className="field-label">
                Details
                <textarea value={directiveBody} onChange={(e) => setDirectiveBody(e.target.value)} rows={3} />
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                <span>LLM decomposition (off = rule-based)</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={planAfterRoute} onChange={(e) => setPlanAfterRoute(e.target.checked)} />
                <span>Plan sprint after route</span>
              </label>
              <div className="panel-actions">
                <button type="button" disabled={busy} onClick={() => void handleSaveDraft()}>
                  Save draft
                </button>
                <button type="button" disabled={busy} onClick={() => void handlePreview()}>
                  Preview
                </button>
                <button type="button" className="primary-action" disabled={busy} onClick={() => void handleRoute(false)}>
                  Route
                </button>
                <button type="button" disabled={busy} onClick={() => void handleRoute(true)}>
                  Route + Plan
                </button>
              </div>
              {preview && preview.length > 0 ? (
                <div className="command-preview-box">
                  <h5>Preview decomposition</h5>
                  <PreviewTree nodes={preview} />
                </div>
              ) : null}
              </div>
            </div>

            <div className="command-inbox">
              <div className="command-inbox-header">
                <h4>Directive Inbox</h4>
              </div>
              <SearchableListToolbar
                query={directiveSearchQuery}
                onQueryChange={setDirectiveSearchQuery}
                placeholder="Search directives…"
                ariaLabel="Search directives"
                matchCount={
                  debouncedDirectiveQuery.trim() ? filteredDirectives.length : undefined
                }
                totalCount={statusFilteredDirectives.length}
              >
                <select value={directiveFilter} onChange={(e) => setDirectiveFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="routed">Routed</option>
                  <option value="executing">Executing</option>
                  <option value="done">Done</option>
                  <option value="meeting">Meeting</option>
                  <option value="co_ceo">Co-CEO</option>
                  <option value="marketplace">Marketplace</option>
                </select>
              </SearchableListToolbar>
              {debouncedDirectiveQuery.trim() && filteredDirectives.length === 0 ? (
                <p className="search-empty-hint muted">
                  No matches for &ldquo;{debouncedDirectiveQuery}&rdquo;.
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
                      <span className="command-source-pill">{sourceLabel(d.source)}</span>
                      <strong>{d.title}</strong>
                      <span className="muted">
                        {d.status} · {d.spawned_node_ids.length} nodes
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <PaginationBar
                page={directiveSafePage}
                totalPages={directiveTotalPages}
                label="Directives"
                onPageChange={setDirectiveListPage}
              />
              {selectedDirective ? (
                <div className="command-directive-detail">
                  <p className="muted">{selectedDirective.description || "No details."}</p>
                  <p className="muted">
                    Target: {selectedDirective.target} · {selectedDirective.target_ref}
                  </p>
                  <div className="panel-actions">
                    {selectedDirective.status === "open" ? (
                      <button type="button" disabled={busy} onClick={() => void handleRoute(planAfterRoute)}>
                        Route
                      </button>
                    ) : null}
                    {selectedDirective.status !== "cancelled" && selectedDirective.status !== "done" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void cancelDirective(selectedDirective.id).then(() => syncScrumSnapshot())}
                      >
                        Cancel
                      </button>
                    ) : null}
                    {selectedDirective.status === "routed" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updateDirectiveStatus(selectedDirective.id, "done").then(() => syncScrumSnapshot())
                        }
                      >
                        Mark done
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "projects" ? (
          <div className="command-projects-layout">
            <section className="command-form-section">
              <h4>Create project</h4>
              <div className="command-form">
                <label className="field-label">
                  Title
                  <input value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} />
                </label>
                <label className="field-label">
                  Department
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
                    Create
                  </button>
                </div>
              </div>
            </section>
            {project ? (
              <section className="command-form-section">
                <h4>Edit: {project.title}</h4>
                <div className="command-form">
                  <label className="field-label">
                    Active project
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
                    Description
                    <textarea value={editProjectDesc} onChange={(e) => setEditProjectDesc(e.target.value)} rows={2} />
                  </label>
                  <label className="field-label">
                    Priority (1=highest)
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={editProjectPriority}
                      onChange={(e) => setEditProjectPriority(Number(e.target.value))}
                    />
                  </label>
                  <label className="field-label">
                    Sprint cycle (days)
                    <input
                      type="number"
                      min={1}
                      value={editProjectCycle}
                      onChange={(e) => setEditProjectCycle(Number(e.target.value))}
                    />
                  </label>
                  <label className="field-label">
                    Project PM
                    <select value={editProjectPm} onChange={(e) => setEditProjectPm(e.target.value)}>
                      <option value="">Inherit global PM</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{formatAgentOptionLabel(a)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Global default PM
                    <select
                      value={snapshot?.default_pm_agent_id ?? ""}
                      onChange={(e) => void setDefaultPmAgent(e.target.value || null).then(() => syncScrumSnapshot())}
                    >
                      <option value="">Auto-detect</option>
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
                      Save project
                    </button>
                  </div>
                  <p className="muted command-form-note">Progress: {(project.progress * 100).toFixed(0)}%</p>
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
                  <h4>
                    {activeSprint.name} · {activeSprint.status}
                  </h4>
                  <p className="muted">{activeSprint.goal || "No sprint goal set."}</p>
                  <p className="muted">
                    {showSimulationChrome ? "Day" : "Window"} {activeSprint.start_day}–{activeSprint.end_day} · velocity{" "}
                    {activeSprint.velocity_target}
                  </p>
                </div>
              ) : (
                <p className="muted">No active sprint for this project.</p>
              )}
              <div className="command-form">
                <label className="field-label">
                  Sprint name
                  <input value={sprintName} onChange={(e) => setSprintName(e.target.value)} placeholder="Sprint 2" />
                </label>
                <label className="field-label">
                  Goal
                  <input value={sprintGoal} onChange={(e) => setSprintGoal(e.target.value)} />
                </label>
                <label className="field-label">
                  Velocity target (pts)
                  <input
                    type="number"
                    min={1}
                    value={sprintVelocity}
                    onChange={(e) => setSprintVelocity(Number(e.target.value))}
                  />
                </label>
                <div className="panel-actions">
                  <button type="button" disabled={busy} onClick={() => void handleSprintAction("create")}>
                    Create sprint
                  </button>
                  <button type="button" disabled={busy} onClick={() => void handleSprintAction("start")}>
                    Start
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy}
                    onClick={() => void handleSprintAction("plan")}
                  >
                    Plan sprint
                  </button>
                  <button type="button" disabled={busy} onClick={() => void handleSprintAction("close")}>
                    Close sprint
                  </button>
                </div>
              </div>
            </section>
            <div className="command-capacity">
              <h4>Team capacity</h4>
              <div className="command-capacity-grid">
                {(snapshot?.inboxes ?? []).map((entry) => (
                  <article key={entry.agent_id} className="command-capacity-card">
                    <strong>{entry.agent_name}</strong>
                    <p className="muted">
                      {entry.agent_role} · {entry.department} · {entry.assigned_points} pts
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "policies" ? (
          <section className="command-form-section command-policies">
            <h4>Execution policies</h4>
            <div className="command-form">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_schedule ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_schedule: e.target.checked })}
              />
              <span>Auto schedule on directive route</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_worker_enabled ?? true}
                onChange={(e) => void persistSettings({ scrum_worker_enabled: e.target.checked })}
              />
              <span>Background scrum worker (auto route, execute, approve)</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_route ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_route: e.target.checked })}
              />
              <span>Auto route open directives</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_approve ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_approve: e.target.checked })}
              />
              <span>PM auto-approve deliverables (remark Done)</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_execute ?? true}
                onChange={(e) => void persistSettings({ scrum_auto_execute: e.target.checked })}
              />
              <span>Auto execute assigned tasks</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_parallel_agents ?? false}
                onChange={(e) => void persistSettings({ scrum_parallel_agents: e.target.checked })}
              />
              <span>
                Parallel LLM execution (one task per idle agent; LLM calls run outside app lock)
              </span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_auto_retry_blocked ?? true}
                onChange={(e) =>
                  void persistSettings({ scrum_auto_retry_blocked: e.target.checked })
                }
              />
              <span>Auto-retry blocked tasks</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_use_agent_tools ?? false}
                onChange={(e) => void persistSettings({ scrum_use_agent_tools: e.target.checked })}
              />
              <span>Multi-step agent tools (plan → draft → refine)</span>
            </label>
            <h4 className="command-policies-subhead">Company orchestrator</h4>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_enabled ?? true}
                onChange={(e) => void persistSettings({ orchestrator_enabled: e.target.checked })}
              />
              <span>Auto strategic loop (Co-CEO briefings → directives)</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_meeting ?? true}
                onChange={(e) => void persistSettings({ orchestrator_auto_meeting: e.target.checked })}
              />
              <span>Auto escalation meetings when tasks are blocked</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_spawn_co_ceo ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_spawn_co_ceo: e.target.checked })
                }
              />
              <span>Auto-spawn AI Co-CEO if missing</span>
            </label>
            <label className="field-label">
              Orchestrator interval — active work (seconds)
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
              Orchestrator interval — idle (seconds)
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
              Orchestrator interval — blocked / urgent (seconds)
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
              Max directives per orchestrator cycle
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
            <h4 className="command-policies-subhead">Marketplace automation</h4>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_hub_pull ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_hub_pull: e.target.checked })
                }
              />
              <span>Auto-pull hub listings (no manual sync required)</span>
            </label>
            <label className="field-label">
              Hub auto-pull interval (seconds)
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
              <span>Auto-accept open marketplace gigs (from cached hub listings)</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_start_gigs ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_start_gigs: e.target.checked })
                }
              />
              <span>Auto-start accepted gigs (issue marketplace directive)</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_complete_gigs ?? true}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_complete_gigs: e.target.checked })
                }
              />
              <span>Auto-complete gigs after QC approval</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.orchestrator_auto_recruit ?? false}
                onChange={(e) =>
                  void persistSettings({ orchestrator_auto_recruit: e.target.checked })
                }
              />
              <span>Auto-recruit when unassigned sprint work piles up</span>
            </label>
            <label className="field-label">
              Max active gig contracts
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
            <h4 className="command-policies-subhead">Agent runtime</h4>
            <label className="field-label">
              Runtime mode
              <select
                value={settings.agent_runtime_mode ?? "llm_only"}
                onChange={(e) => void persistSettings({ agent_runtime_mode: e.target.value })}
              >
                <option value="llm_only">In-app LLM only</option>
                <option value="openclaw">OpenClaw subprocess</option>
              </select>
            </label>
            <label className="field-label">
              OpenClaw binary path
              <input
                type="text"
                value={settings.openclaw_binary_path ?? ""}
                placeholder="openclaw (PATH) or /usr/local/bin/openclaw"
                onChange={(e) => void persistSettings({ openclaw_binary_path: e.target.value })}
              />
            </label>
            <label className="field-label">
              OpenClaw default agent id
              <input
                type="text"
                value={settings.openclaw_default_agent_id ?? "main"}
                placeholder="main"
                onChange={(e) =>
                  void persistSettings({ openclaw_default_agent_id: e.target.value })
                }
              />
            </label>
            <label className="field-label">
              OpenClaw timeout (seconds)
              <input
                type="number"
                min={30}
                max={3600}
                value={settings.openclaw_timeout_secs ?? 600}
                onChange={(e) =>
                  void persistSettings({ openclaw_timeout_secs: Number(e.target.value) })
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.openclaw_use_local ?? true}
                onChange={(e) => void persistSettings({ openclaw_use_local: e.target.checked })}
              />
              <span>Run OpenClaw embedded locally (`openclaw agent --local`)</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.openclaw_prefer_gateway ?? false}
                onChange={(e) =>
                  void persistSettings({ openclaw_prefer_gateway: e.target.checked })
                }
              />
              <span>Prefer OpenClaw gateway when healthy (omit --local)</span>
            </label>
            {openclawStatus ? (
              <p className="muted">
                OpenClaw: {openclawStatus.binary_available ? "detected" : "missing"} ·{" "}
                {openclawStatus.agent_command_available ? "agent CLI ok" : "legacy stdin only"} ·{" "}
                {openclawStatus.gateway_healthy ? "gateway healthy" : "gateway offline"} —{" "}
                {openclawStatus.message}
              </p>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={openclawTesting || settings.agent_runtime_mode !== "openclaw"}
              onClick={() => void testOpenclaw()}
            >
              {openclawTesting ? "Testing OpenClaw…" : "Test OpenClaw runtime"}
            </button>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.scrum_execution_paused ?? false}
                onChange={(e) => void persistSettings({ scrum_execution_paused: e.target.checked })}
              />
              <span>Pause execution queue</span>
            </label>
            <label className="field-label">
              Min token guard (block auto-run below)
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
              Max executions per batch
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
              Worker interval (seconds)
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
              Max blocked retries
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
            <p className="muted command-form-note">
              Company tokens: {finance.monthly_inflow_tokens.toLocaleString()} inflow configured
            </p>
            <div className="panel-actions">
              <button type="button" className="primary-action" disabled={busy} onClick={() => void handleBatchRun()}>
                Run batch executions
              </button>
            </div>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

