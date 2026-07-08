import { type FormEvent, useMemo, useState } from "react";
import type { AgentRecord, InternalProject, WorkNode, WorkTreeSnapshot } from "../../../types/game";
import { formatAgentOptionLabel } from "../../../utils/agentLabel";
import { openDepartmentWorkspace, openWorkspacePage } from "../../../utils/openWorkspacePage";
import {
  backlogStats,
  canRunTask,
  collectOrphanTasks,
  formatWorkNodeStatus,
  groupBacklogStories,
  runDisabledReason,
  workNodeStatusClass,
} from "./backlogUtils";

type AssignableAgent = Pick<AgentRecord, "id" | "name" | "role" | "department">;

interface BacklogTreePanelProps {
  projects: InternalProject[];
  project?: InternalProject;
  selectedProjectId: string;
  tree?: WorkTreeSnapshot | null;
  agents: AssignableAgent[];
  loading?: boolean;
  onProjectChange: (projectId: string) => void;
  onAssign: (nodeId: string, agentId: string | null) => Promise<void>;
  onExecute: (nodeId: string) => Promise<void>;
  onApprove: (nodeId: string) => Promise<void>;
  onAddTask: (storyId: string, title: string) => Promise<void>;
  onAddStory: (title: string) => Promise<void>;
  onJumpToCommand?: () => void;
}

function TaskRow({
  task,
  agents,
  busy,
  onAssign,
  onExecute,
  onApprove,
}: {
  task: WorkNode;
  agents: AssignableAgent[];
  busy: boolean;
  onAssign: (nodeId: string, agentId: string | null) => Promise<void>;
  onExecute: (nodeId: string) => Promise<void>;
  onApprove: (nodeId: string) => Promise<void>;
}) {
  const runReason = runDisabledReason(task);

  return (
    <tr className="backlog-task-row">
      <td className="backlog-task-title">
        <span className="backlog-task-name">{task.title}</span>
        {task.description ? <span className="muted backlog-task-desc">{task.description}</span> : null}
      </td>
      <td>
        <span className={workNodeStatusClass(task.status)}>{formatWorkNodeStatus(task.status)}</span>
      </td>
      <td className="backlog-task-points">{task.story_points > 0 ? `${task.story_points} pt` : "—"}</td>
      <td>
        <select
          className="backlog-assign-select"
          value={task.assignee_agent_id ?? ""}
          disabled={busy}
          onChange={(event) => void onAssign(task.id, event.target.value || null)}
          aria-label={`Assign ${task.title}`}
        >
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {formatAgentOptionLabel(agent)}
            </option>
          ))}
        </select>
      </td>
      <td className="backlog-task-actions">
        <button
          type="button"
          className="primary-action"
          disabled={busy || !canRunTask(task)}
          title={runReason ?? "Run LLM execution"}
          onClick={() => void onExecute(task.id)}
        >
          Run
        </button>
        {task.status === "in_review" ? (
          <button type="button" disabled={busy} onClick={() => void onApprove(task.id)}>
            Approve
          </button>
        ) : null}
        {task.linked_workspace_page_id ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void openWorkspacePage(task.linked_workspace_page_id!, task.title)}
          >
            Workspace
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function StoryCard({
  group,
  agents,
  busyTaskId,
  draftTitle,
  onDraftTitleChange,
  onAssign,
  onExecute,
  onApprove,
  onAddTask,
}: {
  group: { story: WorkNode; tasks: WorkNode[] };
  agents: AssignableAgent[];
  busyTaskId: string | null;
  draftTitle: string;
  onDraftTitleChange: (value: string) => void;
  onAssign: (nodeId: string, agentId: string | null) => Promise<void>;
  onExecute: (nodeId: string) => Promise<void>;
  onApprove: (nodeId: string) => Promise<void>;
  onAddTask: (storyId: string, title: string) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const doneCount = group.tasks.filter((task) => task.status === "done").length;

  return (
    <article className="backlog-story-card">
      <header className="backlog-story-header">
        <button
          type="button"
          className="backlog-story-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <div className="backlog-story-meta">
          <div className="backlog-story-title-row">
            <h4>{group.story.title}</h4>
            <span className={workNodeStatusClass(group.story.status)}>
              {formatWorkNodeStatus(group.story.status)}
            </span>
            {group.story.story_points > 0 ? (
              <span className="backlog-points-pill">{group.story.story_points} pt</span>
            ) : null}
          </div>
          {group.story.description ? (
            <p className="muted backlog-story-desc">{group.story.description}</p>
          ) : null}
          <p className="muted backlog-story-submeta">
            {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
            {group.tasks.length > 0 ? ` · ${doneCount} done` : ""}
            {group.story.department ? ` · ${group.story.department}` : ""}
          </p>
        </div>
      </header>

      {!collapsed ? (
        <div className="backlog-story-body">
          {group.tasks.length > 0 ? (
            <table className="backlog-task-table">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Status</th>
                  <th scope="col">Pts</th>
                  <th scope="col">Assignee</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    agents={agents}
                    busy={busyTaskId === task.id}
                    onAssign={onAssign}
                    onExecute={onExecute}
                    onApprove={onApprove}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted backlog-story-empty">No tasks yet — add one below.</p>
          )}

          <form
            className="backlog-quick-add"
            onSubmit={(event) => {
              event.preventDefault();
              void onAddTask(group.story.id, draftTitle);
            }}
          >
            <input
              type="text"
              value={draftTitle}
              onChange={(event) => onDraftTitleChange(event.target.value)}
              placeholder={`Add task under “${group.story.title}”`}
              maxLength={120}
              aria-label={`Add task to ${group.story.title}`}
            />
            <button type="submit" className="primary-action" disabled={!draftTitle.trim()}>
              Add task
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}

export function BacklogTreePanel({
  projects,
  project,
  selectedProjectId,
  tree,
  agents,
  loading = false,
  onProjectChange,
  onAssign,
  onExecute,
  onApprove,
  onAddTask,
  onAddStory,
  onJumpToCommand,
}: BacklogTreePanelProps) {
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [storyDrafts, setStoryDrafts] = useState<Record<string, string>>({});
  const [newStoryTitle, setNewStoryTitle] = useState("");

  const groups = useMemo(() => groupBacklogStories(tree?.flat ?? []), [tree]);
  const orphanTasks = useMemo(() => collectOrphanTasks(tree?.flat ?? []), [tree]);
  const stats = useMemo(() => backlogStats(groups, orphanTasks), [groups, orphanTasks]);

  const wrapBusy = async (taskId: string, action: () => Promise<void>) => {
    setBusyTaskId(taskId);
    try {
      await action();
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleAssign = async (nodeId: string, agentId: string | null) => {
    await wrapBusy(nodeId, () => onAssign(nodeId, agentId));
  };

  const handleExecute = async (nodeId: string) => {
    await wrapBusy(nodeId, () => onExecute(nodeId));
  };

  const handleApprove = async (nodeId: string) => {
    await wrapBusy(nodeId, () => onApprove(nodeId));
  };

  const handleAddTask = async (storyId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await onAddTask(storyId, trimmed);
    setStoryDrafts((current) => ({ ...current, [storyId]: "" }));
  };

  const handleAddStory = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newStoryTitle.trim();
    if (!trimmed) {
      return;
    }
    await onAddStory(trimmed);
    setNewStoryTitle("");
  };

  return (
    <div className="backlog-panel">
      <div className="backlog-toolbar">
        <label className="backlog-project-picker">
          <span className="muted">Project</span>
          <select
            value={selectedProjectId || project?.id || ""}
            onChange={(event) => onProjectChange(event.target.value)}
            disabled={projects.length === 0 || loading}
          >
            {projects.length === 0 ? <option value="">No projects</option> : null}
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>

        <div className="backlog-stats" aria-label="Backlog summary">
          <span className="backlog-stat-pill">{stats.storyCount} stories</span>
          <span className="backlog-stat-pill">{stats.taskCount} tasks</span>
          <span className="backlog-stat-pill">{stats.storyPoints} pts</span>
        </div>

        {project ? (
          <button
            type="button"
            className="backlog-team-docs-link"
            onClick={() =>
              void openDepartmentWorkspace(project.owner_department, `${project.title} team docs`)
            }
          >
            Team docs
          </button>
        ) : null}
      </div>

      <p className="muted backlog-hint">
        Stories group work from routed directives. Assign an agent to each task, then Run to generate a deliverable.
        {loading ? " Loading project backlog…" : ""}
      </p>

      {loading ? (
        <p className="muted backlog-loading">Switching project…</p>
      ) : null}

      {!loading && groups.length === 0 && orphanTasks.length === 0 ? (
        <div className="backlog-empty">
          <h4>No backlog yet</h4>
          <p className="muted">
            Issue a directive in Command Center and route it to create stories — or add a story manually below.
          </p>
          {onJumpToCommand ? (
            <button type="button" className="primary-action" onClick={onJumpToCommand}>
              Go to Command Center
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`backlog-story-list${loading ? " backlog-story-list--loading" : ""}`}>
        {!loading
          ? groups.map((group) => (
          <StoryCard
            key={group.story.id}
            group={group}
            agents={agents}
            busyTaskId={busyTaskId}
            draftTitle={storyDrafts[group.story.id] ?? ""}
            onDraftTitleChange={(value) =>
              setStoryDrafts((current) => ({ ...current, [group.story.id]: value }))
            }
            onAssign={handleAssign}
            onExecute={handleExecute}
            onApprove={handleApprove}
            onAddTask={handleAddTask}
          />
            ))
          : null}
      </div>

      {!loading && orphanTasks.length > 0 ? (
        <section className="backlog-orphans">
          <header>
            <h4>Unassigned to a story</h4>
            <p className="muted">These tasks are missing a parent story and should be moved or recreated.</p>
          </header>
          <table className="backlog-task-table">
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Status</th>
                <th scope="col">Pts</th>
                <th scope="col">Assignee</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orphanTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  agents={agents}
                  busy={busyTaskId === task.id}
                  onAssign={handleAssign}
                  onExecute={handleExecute}
                  onApprove={handleApprove}
                />
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <form className="backlog-add-story" onSubmit={(event) => void handleAddStory(event)}>
        <input
          type="text"
          value={newStoryTitle}
          onChange={(event) => setNewStoryTitle(event.target.value)}
          placeholder="New story title"
          maxLength={120}
          aria-label="New story title"
        />
        <button type="submit" className="primary-action" disabled={!newStoryTitle.trim() || !project}>
          Add story
        </button>
      </form>
    </div>
  );
}