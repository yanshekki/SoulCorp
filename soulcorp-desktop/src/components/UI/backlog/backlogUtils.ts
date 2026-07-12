import type { WorkNode, WorkNodeStatus } from "../../../types/game";

export interface BacklogStoryGroup {
  story: WorkNode;
  tasks: WorkNode[];
}

const STATUS_LABELS: Record<WorkNodeStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_sprint: "In sprint",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  blocked: "Blocked",
};

export function formatWorkNodeStatus(status: WorkNodeStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** i18n key for work node status badge (use with t()). */
export function workNodeStatusI18nKey(status: WorkNodeStatus): string {
  return `status.${status}`;
}

export function workNodeStatusClass(status: WorkNodeStatus): string {
  return `backlog-status backlog-status--${status}`;
}

export function groupBacklogStories(flat: WorkNode[]): BacklogStoryGroup[] {
  const stories = flat
    .filter((node) => node.kind === "story")
    .sort((left, right) => left.backlog_rank - right.backlog_rank || left.title.localeCompare(right.title));

  const tasksByStory = new Map<string, WorkNode[]>();
  for (const node of flat) {
    if (node.kind !== "task" || !node.parent_id) {
      continue;
    }
    const bucket = tasksByStory.get(node.parent_id) ?? [];
    bucket.push(node);
    tasksByStory.set(node.parent_id, bucket);
  }

  return stories.map((story) => ({
    story,
    tasks: (tasksByStory.get(story.id) ?? []).sort(
      (left, right) => left.backlog_rank - right.backlog_rank || left.title.localeCompare(right.title),
    ),
  }));
}

export function collectOrphanTasks(flat: WorkNode[]): WorkNode[] {
  const storyIds = new Set(flat.filter((node) => node.kind === "story").map((node) => node.id));
  return flat
    .filter(
      (node) =>
        node.kind === "task" &&
        (!node.parent_id || !storyIds.has(node.parent_id)),
    )
    .sort((left, right) => left.backlog_rank - right.backlog_rank || left.title.localeCompare(right.title));
}

export function backlogStats(groups: BacklogStoryGroup[], orphans: WorkNode[]) {
  const taskCount = groups.reduce((sum, group) => sum + group.tasks.length, 0) + orphans.length;
  const storyPoints =
    groups.reduce(
      (sum, group) =>
        sum + group.story.story_points + group.tasks.reduce((inner, task) => inner + task.story_points, 0),
      0,
    ) + orphans.reduce((sum, task) => sum + task.story_points, 0);

  return {
    storyCount: groups.length,
    taskCount,
    storyPoints,
  };
}

export function canRunTask(task: WorkNode): boolean {
  return (
    task.kind === "task" &&
    Boolean(task.assignee_agent_id) &&
    task.status !== "done" &&
    task.status !== "in_review" &&
    task.status !== "blocked"
  );
}

export function runDisabledReason(task: WorkNode): string | null {
  if (task.kind !== "task") {
    return "Only tasks can be run";
  }
  if (!task.assignee_agent_id) {
    return "Assign an agent first — Run spends tokens for that agent to write a deliverable.";
  }
  if (task.status === "done") {
    return "Already done — open Workspace for the deliverable. Run only works on unfinished tasks.";
  }
  if (task.status === "in_review") {
    return "Awaiting review — use Approve (or fix, then re-run after revision).";
  }
  if (task.status === "blocked") {
    return "Task is blocked — unblock before running.";
  }
  return null;
}

/** Primary action label for the task row (what the gold button should do). */
export function taskPrimaryAction(
  task: WorkNode,
): "run" | "approve" | "open_result" | "assign" | "blocked" | "busy" {
  if (task.status === "done") {
    return task.linked_workspace_page_id ? "open_result" : "blocked";
  }
  if (task.status === "in_review") {
    return "approve";
  }
  if (task.status === "blocked") {
    return "blocked";
  }
  if (!task.assignee_agent_id) {
    return "assign";
  }
  return "run";
}

