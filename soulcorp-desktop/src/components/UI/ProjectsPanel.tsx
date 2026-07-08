import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showSimulationChrome } from "../../config/features";
import { useGameStore } from "../../stores/gameStore";
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

export const PROJECTS_SECTIONS = [
  { id: "command", label: "Directive", step: 1, hint: "Issue CEO orders" },
  { id: "backlog", label: "Backlog", step: 2, hint: "PM decomposes tree" },
  { id: "sprint", label: "Sprint", step: 3, hint: "Plan the cycle" },
  { id: "inbox", label: "Assign", step: 4, hint: "Agent workload" },
  { id: "execution", label: "Execute", step: 5, hint: "Run & review" },
] as const;

interface ProjectsPanelProps {
  onSectionFocus?: (sectionId: string) => void;
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
  return (
    <div className="projects-kanban-col">
      <h4>
        {title} <span className="projects-count-pill">{items.length}</span>
      </h4>
      {items.length === 0 ? <p className="muted">Empty</p> : null}
      {items.map((item) => (
        <article key={item.id} className="projects-kanban-card">
          <strong>{item.title}</strong>
          <p className="muted">
            {item.kind} · {item.status}
          </p>
          {item.assignee_agent_id ? (
            <p className="muted">
              Assignee: {agentLabels.get(item.assignee_agent_id) ?? item.assignee_agent_id}
            </p>
          ) : null}
          {item.linked_workspace_page_id ? (
            <button
              type="button"
              className="projects-kanban-workspace-link"
              onClick={() => onOpenWorkspace(item.linked_workspace_page_id!, item.title)}
            >
              Open deliverable
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ProjectsPanel({ onSectionFocus }: ProjectsPanelProps) {
  const activeCompanyId = useGameStore((s) => s.activeCompanyId);
  const scrumRevision = useGameStore((s) => s.scrumRevision);
  const agentRecords = useGameStore((s) => s.agentRecords);
  const setStatusMessage = useGameStore((s) => s.setStatusMessage);

  const [snapshot, setSnapshot] = useState<ScrumSnapshot | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [backlogLoading, setBacklogLoading] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const skipScrumSyncRef = useRef(false);

  const agents = useMemo(
    () =>
      agentRecords
        .filter((a) => a.agent_kind !== "fate")
        .map((a) => ({ id: a.id, name: a.name, role: a.role, department: a.department })),
    [agentRecords],
  );

  const agentLabels = useMemo(() => agentLabelById(agents), [agents]);

  const loadSnapshot = useCallback(
    async (projectId?: string) => {
      const pid = projectId || selectedProjectId || undefined;
      setBacklogLoading(true);
      try {
        const data = await getScrumSnapshot(pid);
        setSnapshot(data);
      } catch (error) {
        setStatusMessage(String(error));
      } finally {
        setBacklogLoading(false);
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

  useEffect(() => {
    setSnapshot(null);
    setSelectedProjectId("");
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    let cancelled = false;
    setBacklogLoading(true);
    void (async () => {
      try {
        const data = await getScrumSnapshot();
        if (cancelled) {
          return;
        }
        setSnapshot(data);
        setSelectedProjectId(data.projects[0]?.id ?? "");
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

  useEffect(() => {
    if (!onSectionFocus) return;
    const root = scrollRootRef.current?.closest(".app-page-content");
    const sections = scrollRootRef.current?.querySelectorAll("[data-projects-section]");
    if (!root || !sections?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute("data-projects-section");
        if (id) onSectionFocus(id);
      },
      { root, rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [onSectionFocus, snapshot]);

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
    void loadSnapshot(projectId);
  };

  const handleAssign = async (nodeId: string, agentId: string | null) => {
    try {
      await assignWorkNode(nodeId, agentId);
      setStatusMessage(agentId ? "Task assigned." : "Task unassigned.");
      await syncScrumSnapshot(project?.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleExecute = async (nodeId: string) => {
    try {
      const estimate = await estimateWorkExecutionCost(nodeId);
      if (!estimate.affordable) {
        setStatusMessage(estimate.message);
        return;
      }
      const run = await runWorkExecution(nodeId);
      setStatusMessage(`Execution ${run.status}: ${run.summary || run.error || "done"}`);
      await syncScrumSnapshot(project?.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleApprove = async (nodeId: string) => {
    try {
      await approveDeliverable(nodeId);
      setStatusMessage("Deliverable approved.");
      await syncScrumSnapshot(project?.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleAddTask = async (storyId: string, title: string) => {
    if (!project) {
      setStatusMessage("Select a project first.");
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
      setStatusMessage(`Task "${title}" added.`);
      await syncScrumSnapshot(project.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleAddStory = async (title: string) => {
    if (!project) {
      setStatusMessage("Select a project first.");
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
      setStatusMessage(`Story "${title}" added.`);
      await syncScrumSnapshot(project.id);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="projects-panel projects-panel--page" ref={scrollRootRef}>
      <CommandCenterPanel
        onJumpToSection={(sectionId) => {
          onSectionFocus?.(sectionId);
          document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <section id="backlog" className="projects-card" data-projects-section="backlog">
        <header className="projects-card-header">
          <p className="workflow-step-badge">2 · Backlog</p>
          <h3>Backlog Tree</h3>
          <p className="muted">Stories and tasks decomposed from CEO directives.</p>
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
              onSectionFocus?.("command");
              document.getElementById("command")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>
      </section>

      <section id="sprint" className="projects-card" data-projects-section="sprint">
        <header className="projects-card-header">
          <p className="workflow-step-badge">3 · Sprint</p>
          <h3>Sprint Board</h3>
          {board?.active_sprint ? (
            <p className="muted">
              {board.active_sprint.name} · {board.active_sprint.status}
              {showSimulationChrome
                ? ` · Day ${board.active_sprint.start_day}–${board.active_sprint.end_day}`
                : ` · Sprint window ${board.active_sprint.start_day}–${board.active_sprint.end_day}`}
            </p>
          ) : (
            <p className="muted">No active sprint — click Plan Sprint in Command Center.</p>
          )}
        </header>
        <div className="projects-card-body">
          {board ? (
            <>
              <div className="projects-burndown">
                <button
                  type="button"
                  className="projects-burndown-link"
                  onClick={() => void openWorkspaceFolder(PROJECTS_FOLDER_ID, "Projects")}
                  title="Open project docs in Workspace"
                >
                  Burndown: {board.burndown_remaining} / {board.burndown_total} pts remaining
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
                  title="Backlog"
                  items={board.backlog}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title="Sprint"
                  items={board.sprint_items}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title="In Progress"
                  items={board.in_progress}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title="Review"
                  items={board.in_review}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
                <KanbanColumn
                  title="Done"
                  items={board.done}
                  agentLabels={agentLabels}
                  onOpenWorkspace={(pageId, label) => void openWorkspacePage(pageId, label)}
                />
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section id="inbox" className="projects-card" data-projects-section="inbox">
        <header className="projects-card-header">
          <p className="workflow-step-badge">4 · Assign</p>
          <h3>Agent Inbox</h3>
          <p className="muted">Per-employee assigned tasks and workload points.</p>
        </header>
        <div className="projects-card-body projects-inbox-grid">
          {inboxes.map((entry) => (
            <article key={entry.agent_id} className="projects-inbox-card">
              <h4>{entry.agent_name}</h4>
              <p className="muted">
                {entry.agent_role || "—"} · {entry.department} · {entry.assigned_points} pts
              </p>
              {entry.tasks.length === 0 ? (
                <p className="muted">No assigned tasks</p>
              ) : (
                <ul>
                  {entry.tasks.map((t) => (
                    <li key={t.id}>
                      {t.title} · {t.status}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <ExecutionLogSection
        runs={runs}
        workNodes={allWorkNodes}
        agentLabels={agentLabels}
        onApprove={handleApprove}
      />
    </div>
  );
}