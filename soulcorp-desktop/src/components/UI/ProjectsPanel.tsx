import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showSimulationChrome } from "../../config/features";
import { useGameStore } from "../../stores/gameStore";
import {
  clearScrumSnapshotCache,
  getCachedScrumSnapshot,
  setCachedScrumSnapshot,
} from "../../stores/scrumSnapshotCache";
import {
  approveDeliverable,
  assignWorkNode,
  createWorkNode,
  estimateWorkExecutionCost,
  getScrumSnapshot,
  runWorkExecution,
} from "../../services/scrumClient";
import { BacklogTreePanel } from "./backlog/BacklogTreePanel";
import { CommandCenterPanel } from "./command-center/CommandCenterPanel";
import { ExecutionLogSection } from "./execution/ExecutionLogSection";
import type {
  AgentInboxEntry,
  ScrumBoardSnapshot,
  ScrumSnapshot,
  WorkNode,
} from "../../types/game";
import { agentLabelById } from "../../utils/agentLabel";
import { openWorkspaceFolder, openWorkspacePage } from "../../utils/openWorkspacePage";
import { PROJECTS_FOLDER_ID } from "../../utils/workspaceFolderIds";
import { notifyScrumChanged } from "../../utils/scrumSync";
import {
  finishProgress,
  reportLocalProgress,
  useProgressStore,
} from "../../stores/progressStore";
import { confirmDialog } from "../../utils/nativeDialog";
import { useI18n } from "../../i18n/I18nProvider";

export const PROJECTS_SECTIONS = [
  { id: "command", label: "Directive", step: 1, hint: "Issue CEO orders" },
  { id: "backlog", label: "Backlog", step: 2, hint: "PM decomposes tree" },
  { id: "sprint", label: "Sprint", step: 3, hint: "Plan the cycle" },
  { id: "inbox", label: "Assign", step: 4, hint: "Agent workload" },
  { id: "execution", label: "Execute", step: 5, hint: "Run & review" },
] as const;

interface ProjectsPanelProps {
  activeSection: string;
  onNavigateSection?: (sectionId: string) => void;
}

function KanbanColumn({
  title,
  items,
  agentLabels,
  onOpenWorkspace,
}: {
  title: string;
  items: WorkNode[];
  agentLabels: Map<string, string>;
  onOpenWorkspace: (pageId: string, label: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="projects-kanban-col">
      <h4>
        {title} <span className="projects-count-pill">{items.length}</span>
      </h4>
      {items.length === 0 ? <p className="muted">{t("projects.emptyColumn")}</p> : null}
      {items.map((item) => (
        <article key={item.id} className="projects-kanban-card">
          <strong>{item.title}</strong>
          <p className="muted">
            {item.kind} · {item.status}
          </p>
          {item.assignee_agent_id ? (
            <p className="muted">
              {t("projects.assignee", {
                name: agentLabels.get(item.assignee_agent_id) ?? item.assignee_agent_id,
              })}
            </p>
          ) : null}
          {item.linked_workspace_page_id ? (
            <button
              type="button"
              className="projects-kanban-workspace-link"
              onClick={() => onOpenWorkspace(item.linked_workspace_page_id!, item.title)}
            >
              {t("projects.openDeliverable")}
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ProjectsPanel({ activeSection, onNavigateSection }: ProjectsPanelProps) {
  const { t } = useI18n();
  const activeCompanyId = useGameStore((s) => s.activeCompanyId);
  const scrumRevision = useGameStore((s) => s.scrumRevision);
  const agentRecords = useGameStore((s) => s.agentRecords);
  const setStatusMessage = useGameStore((s) => s.setStatusMessage);

  const [snapshot, setSnapshot] = useState<ScrumSnapshot | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  /** True only for first paint / project switch — never for background worker soft-refresh. */
  const [backlogLoading, setBacklogLoading] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const skipScrumSyncRef = useRef(false);
  const hasSnapshotRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;

  const agents = useMemo(
    () =>
      agentRecords
        .filter((a) => a.agent_kind !== "fate")
        .map((a) => ({ id: a.id, name: a.name, role: a.role, department: a.department })),
    [agentRecords],
  );

  const agentLabels = useMemo(() => agentLabelById(agents), [agents]);

  const loadSnapshot = useCallback(
    async (
      projectId?: string,
      options?: {
        /** Full loading UI (unmount list). Default: only when no data yet. */
        showLoading?: boolean;
      },
    ) => {
      const pid = projectId || selectedProjectIdRef.current || undefined;
      const showLoading = options?.showLoading ?? !hasSnapshotRef.current;
      const generation = ++loadGenerationRef.current;
      if (showLoading) {
        setBacklogLoading(true);
      }
      try {
        const data = await getScrumSnapshot(pid);
        if (generation !== loadGenerationRef.current) {
          return;
        }
        if (activeCompanyId) {
          setCachedScrumSnapshot(activeCompanyId, data);
        }
        hasSnapshotRef.current = true;
        setSnapshot(data);
      } catch (error) {
        if (generation === loadGenerationRef.current) {
          setStatusMessage(String(error));
        }
      } finally {
        if (generation === loadGenerationRef.current && showLoading) {
          setBacklogLoading(false);
        }
      }
    },
    [activeCompanyId, setStatusMessage],
  );

  const syncScrumSnapshot = useCallback(
    async (projectId?: string) => {
      // Soft refresh after local actions — keep current UI mounted.
      await loadSnapshot(projectId, { showLoading: false });
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
    // Worker ticks / remote changes: update values in place, no flash.
    void loadSnapshot(selectedProjectIdRef.current || undefined, { showLoading: false });
  }, [scrumRevision, activeCompanyId, loadSnapshot]);

  useEffect(() => {
    hasSnapshotRef.current = false;
    setSnapshot(null);
    setSelectedProjectId("");
    clearScrumSnapshotCache();
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    const cached = getCachedScrumSnapshot(activeCompanyId);
    if (cached) {
      hasSnapshotRef.current = true;
      setSnapshot(cached);
      setSelectedProjectId(cached.projects[0]?.id ?? "");
      setBacklogLoading(false);
    }
    let cancelled = false;
    if (!cached) {
      setBacklogLoading(true);
    }
    void (async () => {
      try {
        const data = await getScrumSnapshot();
        if (cancelled) {
          return;
        }
        setCachedScrumSnapshot(activeCompanyId, data);
        hasSnapshotRef.current = true;
        setSnapshot(data);
        setSelectedProjectId((current) => current || data.projects[0]?.id || "");
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(String(error));
        }
      } finally {
        if (!cancelled) {
          setBacklogLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, setStatusMessage]);

  const project =
    snapshot?.projects.find((p) => p.id === selectedProjectId) ?? snapshot?.projects[0];
  const board: ScrumBoardSnapshot | null = snapshot?.board ?? null;
  const tree = snapshot?.tree;
  const inboxes: AgentInboxEntry[] = snapshot?.inboxes ?? [];
  const runs = snapshot?.execution_runs ?? [];

  const allWorkNodes = useMemo(() => {
    if (tree?.flat?.length) {
      return tree.flat;
    }
    if (!board) {
      return [];
    }
    return [
      ...board.backlog,
      ...board.sprint_items,
      ...board.in_progress,
      ...board.in_review,
      ...board.done,
    ];
  }, [tree, board]);

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    // Project switch may show a different tree — allow brief loading if empty.
    void loadSnapshot(projectId, { showLoading: !hasSnapshotRef.current });
  };

  const handleAssign = async (nodeId: string, agentId: string | null) => {
    try {
      await assignWorkNode(nodeId, agentId);
      setStatusMessage(agentId ? t("status.taskAssigned") : t("status.taskUnassigned"));
      await syncScrumSnapshot(project?.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleExecute = async (nodeId: string) => {
    const task = allWorkNodes.find((node) => node.id === nodeId);
    const taskLabel = task?.title?.trim() || "task";
    const opId = `run_work_${nodeId}`;
    try {
      const estimate = await estimateWorkExecutionCost(nodeId);
      if (!estimate.affordable) {
        setStatusMessage(estimate.message || t("status.notEnoughTokens"));
        return;
      }
      const ok = await confirmDialog(
        t("status.runAgentConfirm", {
          task: taskLabel,
          tokens: estimate.estimated_tokens.toLocaleString(),
          detail: estimate.message || t("status.runProgressDefault"),
        }),
        { title: t("status.runAgentTitle"), kind: "info" },
      );
      if (!ok) {
        setStatusMessage(t("status.runCancelled"));
        return;
      }
      setStatusMessage(t("status.runningAgent", { task: taskLabel }));
      reportLocalProgress(
        opId,
        t("status.runningAgentProgress", { task: taskLabel }),
        -1,
        "llm",
      );
      useProgressStore.getState().setLlmLiveOpen(true);
      const run = await runWorkExecution(nodeId);
      const summary =
        run.summary?.trim() ||
        run.error?.trim() ||
        (run.status === "succeeded" ? t("status.deliverableReady") : run.status);
      const message = t("status.executionStatus", { status: run.status, summary });
      setStatusMessage(message);
      finishProgress(opId, message, run.status === "succeeded" ? "done" : "error");
      await syncScrumSnapshot(project?.id);
      if (run.deliverable_page_id) {
        // Soft offer: do not force navigation; status already explains outcome.
      }
    } catch (error) {
      const message = String(error);
      setStatusMessage(message);
      finishProgress(opId, message, "error");
    }
  };

  const handleApprove = async (nodeId: string) => {
    try {
      await approveDeliverable(nodeId);
      setStatusMessage(t("status.deliverableApproved"));
      await syncScrumSnapshot(project?.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleAddTask = async (storyId: string, title: string) => {
    if (!project) {
      setStatusMessage(t("status.selectProjectFirst"));
      return;
    }
    try {
      await createWorkNode({
        project_id: project.id,
        parent_id: storyId,
        kind: "task",
        title,
        department: project.owner_department,
        story_points: 1,
      });
      setStatusMessage(t("status.taskAdded", { title }));
      await syncScrumSnapshot(project.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleAddStory = async (title: string) => {
    if (!project) {
      setStatusMessage(t("status.selectProjectFirst"));
      return;
    }
    try {
      await createWorkNode({
        project_id: project.id,
        kind: "story",
        title,
        department: project.owner_department,
        story_points: 3,
      });
      setStatusMessage(t("status.storyAdded", { title }));
      await syncScrumSnapshot(project.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="projects-panel projects-panel--page" ref={scrollRootRef}>
      {activeSection === "command" ? (
      <CommandCenterPanel
        onJumpToSection={(sectionId) => {
          onNavigateSection?.(sectionId);
        }}
      />
      ) : null}

      {activeSection === "backlog" ? (
      <section id="backlog" className="projects-card" data-projects-section="backlog">
        <header className="projects-card-header">
          <p className="workflow-step-badge">{t("projects.stepBadge", { step: 2, label: t("projects.section.backlog") })}</p>
          <h3>{t("projects.backlogTree")}</h3>
          <p className="muted">{t("projects.backlogTreeDesc")}</p>
        </header>
        <div className="projects-card-body">
          <BacklogTreePanel
            projects={snapshot?.projects ?? []}
            project={project}
            selectedProjectId={selectedProjectId}
            tree={tree}
            agents={agents}
            loading={backlogLoading}
            onProjectChange={handleProjectChange}
            onAssign={handleAssign}
            onExecute={handleExecute}
            onApprove={handleApprove}
            onAddTask={handleAddTask}
            onAddStory={handleAddStory}
            onJumpToCommand={() => {
              onNavigateSection?.("command");
            }}
          />
        </div>
      </section>
      ) : null}

      {activeSection === "sprint" ? (
      <section id="sprint" className="projects-card" data-projects-section="sprint">
        <header className="projects-card-header">
          <p className="workflow-step-badge">{t("projects.stepBadge", { step: 3, label: t("projects.section.sprint") })}</p>
          <h3>{t("projects.sprintBoard")}</h3>
          {board?.active_sprint ? (
            <p className="muted">
              {board.active_sprint.name} · {board.active_sprint.status}
              {showSimulationChrome
                ? ` · ${t("projects.sprintDayRange", { start: board.active_sprint.start_day, end: board.active_sprint.end_day })}`
                : ` · ${t("projects.sprintWindow", { start: board.active_sprint.start_day, end: board.active_sprint.end_day })}`}
            </p>
          ) : (
            <p className="muted">{t("projects.noActiveSprint")}</p>
          )}
        </header>
        <div className="projects-card-body">
          {board ? (
            <>
              <div className="projects-burndown">
                <button
                  type="button"
                  className="projects-burndown-link"
                  onClick={() => void openWorkspaceFolder(PROJECTS_FOLDER_ID, t("projects.folder"))}
                  title={t("projects.openDocs")}
                >
                  {t("projects.burndown", { remaining: board.burndown_remaining, total: board.burndown_total })}
                </button>
                <div className="projects-burndown-bar">
                  <div
                    className="projects-burndown-fill"
                    style={{
                      width: board.burndown_total
                        ? `${((board.burndown_total - board.burndown_remaining) / board.burndown_total) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
              <div className="projects-kanban">
                <KanbanColumn
                  title={t("projects.col.backlog")}
                  items={board.backlog}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title={t("projects.col.sprint")}
                  items={board.sprint_items}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title={t("projects.col.inProgress")}
                  items={board.in_progress}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title={t("projects.col.review")}
                  items={board.in_review}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title={t("projects.col.done")}
                  items={board.done}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
              </div>
            </>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeSection === "inbox" ? (
      <section id="inbox" className="projects-card" data-projects-section="inbox">
        <header className="projects-card-header">
          <p className="workflow-step-badge">{t("projects.stepBadge", { step: 4, label: t("projects.section.inbox") })}</p>
          <h3>{t("projects.agentInbox")}</h3>
          <p className="muted">{t("projects.agentInboxDesc")}</p>
        </header>
        <div className="projects-card-body projects-inbox-grid">
          {inboxes.map((entry) => (
            <article key={entry.agent_id} className="projects-inbox-card">
              <h4>{entry.agent_name}</h4>
              <p className="muted">
                {t("projects.inboxMeta", {
                  role: entry.agent_role || "—",
                  dept: entry.department,
                  pts: entry.assigned_points,
                })}
                {entry.busy ? t("projects.inboxWorking") : ""}
                {typeof entry.queued_count === "number" && entry.queued_count > 0
                  ? t("projects.inboxQueued", { n: entry.queued_count })
                  : ""}
              </p>
              {entry.tasks.length === 0 ? (
                <p className="muted">{t("projects.noAssignedTasks")}</p>
              ) : (
                <ul>
                  {entry.tasks.map((task) => (
                    <li key={task.id}>
                      {task.title} · {task.status}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>
      ) : null}

      {activeSection === "execution" ? (
      <div id="execution" data-projects-section="execution">
      <ExecutionLogSection
        runs={runs}
        workNodes={allWorkNodes}
        agentLabels={agentLabels}
        onApprove={handleApprove}
      />
      </div>
      ) : null}
    </div>
  );
}