import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import type { AgentRecord, InternalProject, WorkNode, WorkTreeSnapshot } from "../../../types/game";
import { formatAgentOptionLabel } from "../../../utils/agentLabel";
import { BACKLOG_SEARCH_TYPES } from "../../../data/searchFilterOptions";
import { fieldsMatchQuery, tokenizeQuery } from "../../../utils/listSearch";
import { SEARCH_TYPE_ALL } from "../../../utils/searchTypeFilters";
import { openDepartmentWorkspace, openWorkspacePage } from "../../../utils/openWorkspacePage";
import { useI18n } from "../../../i18n/I18nProvider";
import { SearchableListToolbar } from "../SearchableListToolbar";
import {
  backlogStats,
  canRunTask,
  collectOrphanTasks,
  formatWorkNodeStatus,
  groupBacklogStories,
  runDisabledReason,
  taskPrimaryAction,
  workNodeStatusClass,
  workNodeStatusI18nKey,
} from "./backlogUtils";
import {
  localizeWorkDescription,
  localizeWorkTitle,
} from "../../../utils/localizeWorkTitle";

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
  const { t, language } = useI18n();
  const runReason = runDisabledReason(task);
  const primary = taskPrimaryAction(task);
  const canRun = canRunTask(task);
  const displayTitle = localizeWorkTitle(task.title, language);
  const displayDesc = task.description
    ? localizeWorkDescription(task.description, language)
    : "";

  return (
    <tr className={`backlog-task-row${busy ? " is-busy" : ""}`}>
      <td className="backlog-task-title">
        <span className="backlog-task-name">{displayTitle}</span>
        {displayDesc ? <span className="muted backlog-task-desc">{displayDesc}</span> : null}
        {runReason && primary !== "run" ? (
          <span className="muted backlog-task-action-hint" title={runReason}>
            {primary === "open_result"
              ? t("backlog.doneHint")
              : primary === "approve"
                ? t("backlog.reviewHint")
                : primary === "assign"
                  ? t("backlog.assignHint")
                  : runReason}
          </span>
        ) : null}
        {busy ? (
          <span className="backlog-task-action-hint backlog-task-action-hint--live">
            {t("backlog.runningHint")}
          </span>
        ) : null}
      </td>
      <td>
        <span className={workNodeStatusClass(task.status)}>
          {t(workNodeStatusI18nKey(task.status)) === workNodeStatusI18nKey(task.status)
            ? formatWorkNodeStatus(task.status)
            : t(workNodeStatusI18nKey(task.status))}
        </span>
      </td>
      <td className="backlog-task-points">
        {task.story_points > 0 ? t("backlog.points", { n: task.story_points }) : "—"}
      </td>
      <td>
        <select
          className="backlog-assign-select"
          value={task.assignee_agent_id ?? ""}
          disabled={busy}
          onChange={(event) => void onAssign(task.id, event.target.value || null)}
          aria-label={`Assign ${task.title}`}
        >
          <option value="">{t("backlog.unassigned")}</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {formatAgentOptionLabel(agent)}
            </option>
          ))}
        </select>
      </td>
      <td className="backlog-task-actions">
        {primary === "run" || primary === "assign" ? (
          <button
            type="button"
            className="primary-action"
            disabled={busy || !canRun}
            title={
              canRun
                ? t("backlog.title.runDeliverable")
                : (runReason ?? t("backlog.title.cannotRun"))
            }
            onClick={() => {
              if (!canRun) {
                return;
              }
              void onExecute(task.id);
            }}
          >
            {busy ? t("backlog.running") : t("backlog.runAgent")}
          </button>
        ) : null}
        {primary === "approve" ? (
          <button
            type="button"
            className="primary-action"
            disabled={busy}
            title={t("backlog.title.approve")}
            onClick={() => void onApprove(task.id)}
          >
            {busy ? "…" : t("backlog.approve")}
          </button>
        ) : null}
        {primary === "open_result" && task.linked_workspace_page_id ? (
          <button
            type="button"
            className="primary-action"
            disabled={busy}
            title={t("backlog.title.openResult")}
            onClick={() => void openWorkspacePage(task.linked_workspace_page_id!, task.title)}
          >
            {t("backlog.openResult")}
          </button>
        ) : null}
        {primary === "blocked" ? (
          <button
            type="button"
            className="primary-action"
            disabled
            title={runReason ?? t("backlog.title.unavailable")}
          >
            {task.status === "done" ? t("backlog.done") : t("backlog.blocked")}
          </button>
        ) : null}
        {task.linked_workspace_page_id && primary !== "open_result" ? (
          <button
            type="button"
            disabled={busy}
            title={t("backlog.title.openLinked")}
            onClick={() => void openWorkspacePage(task.linked_workspace_page_id!, task.title)}
          >
            {t("backlog.workspace")}
          </button>
        ) : null}
        {task.status === "in_review" && task.linked_workspace_page_id ? (
          <button
            type="button"
            disabled={busy}
            title={t("backlog.title.preview")}
            onClick={() => void openWorkspacePage(task.linked_workspace_page_id!, task.title)}
          >
            {t("backlog.preview")}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function storySearchFields(story: WorkNode): string[] {
  return [story.title, story.description ?? "", story.status];
}

function taskSearchFields(
  task: WorkNode,
  agents: AssignableAgent[],
  searchType: string,
): string[] {
  const assignee = agents.find((agent) => agent.id === task.assignee_agent_id);
  switch (searchType) {
    case "story":
      return [];
    case "assignee":
      return [assignee?.name ?? "", assignee?.role ?? ""];
    case "department":
      return [assignee?.department ?? ""];
    case "task":
      return [task.title, task.description ?? "", task.status];
    default:
      return [
        task.title,
        task.description ?? "",
        assignee?.name ?? "",
        assignee?.role ?? "",
        assignee?.department ?? "",
        task.status,
      ];
  }
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
  forceExpanded = false,
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
  forceExpanded?: boolean;
}) {
  const { t, language } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (forceExpanded) {
      setCollapsed(false);
    }
  }, [forceExpanded]);
  const doneCount = group.tasks.filter((task) => task.status === "done").length;
  const storyTitle = localizeWorkTitle(group.story.title, language);
  const storyDesc = group.story.description
    ? localizeWorkDescription(group.story.description, language)
    : "";

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
            <h4>{storyTitle}</h4>
            <span className={workNodeStatusClass(group.story.status)}>
              {t(workNodeStatusI18nKey(group.story.status)) ===
              workNodeStatusI18nKey(group.story.status)
                ? formatWorkNodeStatus(group.story.status)
                : t(workNodeStatusI18nKey(group.story.status))}
            </span>
            {group.story.story_points > 0 ? (
              <span className="backlog-points-pill">
                {t("backlog.points", { n: group.story.story_points })}
              </span>
            ) : null}
          </div>
          {storyDesc ? (
            <p className="muted backlog-story-desc">{storyDesc}</p>
          ) : null}
          {!group.story.linked_workspace_page_id ? (
            <p className="muted backlog-brief-pending">{t("backlog.briefPending")}</p>
          ) : (
            <button
              type="button"
              className="backlog-brief-link"
              onClick={() =>
                void openWorkspacePage(group.story.linked_workspace_page_id!, group.story.title)
              }
            >
              {t("backlog.openBrief")}
            </button>
          )}
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
                  <th scope="col">{t("backlog.col.task")}</th>
                  <th scope="col">{t("backlog.col.status")}</th>
                  <th scope="col">{t("backlog.col.pts")}</th>
                  <th scope="col">{t("backlog.col.assignee")}</th>
                  <th scope="col">{t("backlog.col.actions")}</th>
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
              {t("backlog.addTask")}
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
  const { t } = useI18n();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [storyDrafts, setStoryDrafts] = useState<Record<string, string>>({});
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  /** Default on: hide done tasks/stories so the tree focuses open work. */
  const [hideCompleted, setHideCompleted] = useState(true);
  const debouncedQuery = useDebouncedValue(searchQuery);

  const groups = useMemo(() => groupBacklogStories(tree?.flat ?? []), [tree]);
  const orphanTasks = useMemo(() => collectOrphanTasks(tree?.flat ?? []), [tree]);
  const searchTokens = useMemo(() => tokenizeQuery(debouncedQuery), [debouncedQuery]);

  type FilteredStoryGroup = {
    story: WorkNode;
    tasks: WorkNode[];
    forceExpanded?: boolean;
  };

  const isDoneNode = (node: WorkNode) => node.status === "done";

  const filteredGroups = useMemo((): FilteredStoryGroup[] => {
    const afterSearch = (() => {
      if (searchTokens.length === 0) {
        return groups.map((group) => ({
          story: group.story,
          tasks: group.tasks,
          forceExpanded: false as boolean | undefined,
        }));
      }
      const storySearchEnabled =
        searchType === SEARCH_TYPE_ALL || searchType === "story";
      const taskSearchEnabled =
        searchType === SEARCH_TYPE_ALL ||
        searchType === "task" ||
        searchType === "assignee" ||
        searchType === "department";

      return groups
        .map((group): FilteredStoryGroup | null => {
          const storyMatches =
            storySearchEnabled &&
            fieldsMatchQuery(storySearchFields(group.story), searchTokens);
          const matchingTasks = taskSearchEnabled
            ? group.tasks.filter((task) =>
                fieldsMatchQuery(taskSearchFields(task, agents, searchType), searchTokens),
              )
            : [];
          if (!storyMatches && matchingTasks.length === 0) {
            return null;
          }
          return {
            story: group.story,
            tasks: storyMatches ? group.tasks : matchingTasks,
            forceExpanded: matchingTasks.length > 0,
          };
        })
        .filter((group): group is FilteredStoryGroup => group !== null);
    })();

    if (!hideCompleted) {
      return afterSearch;
    }

    return afterSearch
      .map((group): FilteredStoryGroup | null => {
        const openTasks = group.tasks.filter((task) => !isDoneNode(task));
        // Fully completed story (story done + no open tasks): hide the whole card.
        if (isDoneNode(group.story) && openTasks.length === 0) {
          return null;
        }
        // Story still open/in progress but some tasks done: hide only done rows.
        return {
          ...group,
          tasks: openTasks,
        };
      })
      .filter((group): group is FilteredStoryGroup => group !== null);
  }, [groups, searchTokens, agents, searchType, hideCompleted]);

  const filteredOrphanTasks = useMemo(() => {
    let list = orphanTasks;
    if (searchTokens.length > 0) {
      if (searchType === "story") {
        list = [];
      } else {
        list = orphanTasks.filter((task) =>
          fieldsMatchQuery(taskSearchFields(task, agents, searchType), searchTokens),
        );
      }
    }
    if (hideCompleted) {
      list = list.filter((task) => !isDoneNode(task));
    }
    return list;
  }, [orphanTasks, searchTokens, agents, searchType, hideCompleted]);

  const hiddenCompletedCount = useMemo(() => {
    if (!hideCompleted) {
      return 0;
    }
    let hidden = 0;
    for (const group of groups) {
      const openTasks = group.tasks.filter((task) => !isDoneNode(task));
      const doneTaskCount = group.tasks.length - openTasks.length;
      if (isDoneNode(group.story) && openTasks.length === 0) {
        // Whole story card hidden (+ its done tasks counted once via the card).
        hidden += 1 + doneTaskCount;
      } else {
        hidden += doneTaskCount;
      }
    }
    hidden += orphanTasks.filter((task) => isDoneNode(task)).length;
    return hidden;
  }, [groups, orphanTasks, hideCompleted]);

  const stats = useMemo(
    () => backlogStats(filteredGroups, filteredOrphanTasks),
    [filteredGroups, filteredOrphanTasks],
  );
  const totalItemCount = groups.length + orphanTasks.length;
  const filteredItemCount = filteredGroups.length + filteredOrphanTasks.length;

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
          <span className="muted">{t("backlog.project")}</span>
          <select
            value={selectedProjectId || project?.id || ""}
            onChange={(event) => onProjectChange(event.target.value)}
            disabled={projects.length === 0 || loading}
          >
            {projects.length === 0 ? <option value="">{t("backlog.noProjects")}</option> : null}
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>

        <div className="backlog-stats" aria-label={t("backlog.summaryAria")}>
          <span className="backlog-stat-pill">{t("backlog.storiesCount", { n: stats.storyCount })}</span>
          <span className="backlog-stat-pill">{t("backlog.tasksCount", { n: stats.taskCount })}</span>
          <span className="backlog-stat-pill">{t("backlog.ptsCount", { n: stats.storyPoints })}</span>
        </div>

        <label className="backlog-hide-completed">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(event) => setHideCompleted(event.target.checked)}
          />
          <span>{t("backlog.hideCompleted")}</span>
          {hideCompleted && hiddenCompletedCount > 0 ? (
            <span className="muted backlog-hide-completed-count">
              {t("backlog.hiddenCompletedCount", { n: hiddenCompletedCount })}
            </span>
          ) : null}
        </label>

        {project ? (
          <button
            type="button"
            className="backlog-team-docs-link"
            onClick={() =>
              void openDepartmentWorkspace(project.owner_department, `${project.title} team docs`)
            }
          >
            {t("backlog.teamDocs")}
          </button>
        ) : null}
      </div>

      <SearchableListToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder={t("backlog.searchPlaceholder")}
        ariaLabel={t("backlog.searchAria")}
        matchCount={
          debouncedQuery.trim() || searchType !== SEARCH_TYPE_ALL
            ? filteredItemCount
            : undefined
        }
        totalCount={totalItemCount}
        typeFilter={{
          value: searchType,
          onChange: setSearchType,
          options: BACKLOG_SEARCH_TYPES,
          ariaLabel: t("backlog.filterFieldAria"),
          label: t("searchType.typeLabel"),
        }}
      />

      {debouncedQuery.trim() && filteredItemCount === 0 ? (
        <p className="search-empty-hint muted">{t("backlog.noMatchesQuery", { query: debouncedQuery })}</p>
      ) : null}

      <p className="muted backlog-hint">
        {t("backlog.hint")}
        {loading && groups.length === 0 ? ` ${t("common.loading")}` : ""}
      </p>

      {/* Only block the UI when we have nothing to show yet — never unmount on soft refresh. */}
      {loading && groups.length === 0 && orphanTasks.length === 0 ? (
        <p className="muted backlog-loading">{t("backlog.loading")}</p>
      ) : null}

      {!loading && groups.length === 0 && orphanTasks.length === 0 ? (
        <div className="backlog-empty">
          <h4>{t("backlog.emptyTitle")}</h4>
          <p className="muted">
            {t("backlog.emptyBody")}
          </p>
          {onJumpToCommand ? (
            <button type="button" className="primary-action" onClick={onJumpToCommand}>
              {t("backlog.goCommand")}
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading &&
      groups.length + orphanTasks.length > 0 &&
      filteredGroups.length === 0 &&
      filteredOrphanTasks.length === 0 ? (
        <div className="backlog-empty backlog-empty--filtered">
          <h4>{t("backlog.allHiddenTitle")}</h4>
          <p className="muted">{t("backlog.allHiddenBody")}</p>
          {hideCompleted ? (
            <button
              type="button"
              className="secondary-action"
              onClick={() => setHideCompleted(false)}
            >
              {t("backlog.showCompleted")}
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={`backlog-story-list${loading && groups.length > 0 ? " backlog-story-list--loading" : ""}`}
        aria-busy={loading || undefined}
      >
        {filteredGroups.map((group) => (
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
            forceExpanded={group.forceExpanded ?? false}
          />
        ))}
      </div>

      {filteredOrphanTasks.length > 0 ? (
        <section className="backlog-orphans">
          <header>
            <h4>{t("backlog.orphansTitle")}</h4>
            <p className="muted">{t("backlog.orphansBody")}</p>
          </header>
          <table className="backlog-task-table">
            <thead>
              <tr>
                <th scope="col">{t("backlog.col.task")}</th>
                <th scope="col">{t("backlog.col.status")}</th>
                <th scope="col">{t("backlog.col.pts")}</th>
                <th scope="col">{t("backlog.col.assignee")}</th>
                <th scope="col">{t("backlog.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrphanTasks.map((task) => (
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
          placeholder={t("backlog.newStoryPlaceholder")}
          maxLength={120}
          aria-label={t("backlog.newStoryAria")}
        />
        <button type="submit" className="primary-action" disabled={!newStoryTitle.trim() || !project}>
          {t("backlog.addStory")}
        </button>
      </form>
    </div>
  );
}