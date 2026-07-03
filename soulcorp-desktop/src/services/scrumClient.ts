import { invoke } from "@tauri-apps/api/core";
import type {
  BatchExecutionResult,
  CommandCenterOverview,
  Directive,
  DirectivePreviewNode,
  DirectiveSource,
  DirectiveStatus,
  DirectiveTarget,
  ExecutionRun,
  InternalProject,
  ScrumSnapshot,
  Sprint,
  WorkExecutionCostEstimate,
  WorkNode,
  WorkNodeKind,
  WorkTreeSnapshot,
} from "../types/game";

export async function getScrumSnapshot(projectId?: string) {
  return invoke<ScrumSnapshot>("get_scrum_snapshot", { projectId: projectId ?? null });
}

export async function getCommandCenterOverview(projectId?: string) {
  return invoke<CommandCenterOverview>("get_command_center_overview", {
    projectId: projectId ?? null,
  });
}

export async function listProjects() {
  return invoke<InternalProject[]>("list_projects");
}

export async function createProject(input: {
  title: string;
  description?: string;
  owner_department?: string;
  priority?: number;
}) {
  return invoke<InternalProject>("create_project", { request: input });
}

export async function updateProject(input: {
  project_id: string;
  title?: string;
  description?: string;
  owner_department?: string;
  priority?: number;
  pm_agent_id?: string | null;
  default_cycle_days?: number;
}) {
  return invoke<InternalProject>("update_project", { request: input });
}

export async function getWorkTree(projectId: string) {
  return invoke<WorkTreeSnapshot>("get_work_tree", { projectId });
}

export async function createWorkNode(input: {
  project_id: string;
  parent_id?: string | null;
  kind: WorkNodeKind;
  title: string;
  description?: string;
  department?: string;
  story_points?: number;
  priority?: number;
}) {
  return invoke<WorkNode>("create_work_node", { request: input });
}

export async function updateWorkNode(input: {
  node_id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  story_points?: number;
  department?: string;
  assignee_agent_id?: string | null;
}) {
  return invoke<WorkNode>("update_work_node", { request: input });
}

export async function assignWorkNode(nodeId: string, agentId: string | null) {
  return invoke<WorkNode>("assign_work_node", {
    request: { node_id: nodeId, agent_id: agentId },
  });
}

export async function issueDirective(input: {
  title: string;
  description?: string;
  target: DirectiveTarget;
  target_ref: string;
  source?: DirectiveSource;
  priority?: number;
}) {
  return invoke<Directive>("issue_directive", { request: input });
}

export async function listDirectives() {
  return invoke<Directive[]>("list_directives");
}

export async function routeDirective(
  directiveId: string,
  projectId: string,
  useLlm = true,
  planSprintAfter = false,
) {
  return invoke<WorkNode[]>("route_directive", {
    request: {
      directive_id: directiveId,
      project_id: projectId,
      use_llm: useLlm,
      plan_sprint_after: planSprintAfter,
    },
  });
}

export async function previewRouteDirective(
  directiveId: string,
  projectId: string,
  useLlm = true,
) {
  return invoke<DirectivePreviewNode[]>("preview_route_directive_cmd", {
    request: { directive_id: directiveId, project_id: projectId, use_llm: useLlm },
  });
}

export async function cancelDirective(directiveId: string) {
  return invoke<Directive>("cancel_directive", { directiveId });
}

export async function updateDirectiveStatus(directiveId: string, status: DirectiveStatus) {
  return invoke<Directive>("update_directive_status", {
    request: { directive_id: directiveId, status },
  });
}

export async function sendCoCeoDirectiveToStae(input: {
  title: string;
  description: string;
  target_department: string;
}) {
  return invoke<Directive>("send_co_ceo_directive_to_stae", { request: input });
}

export async function createSprint(
  projectId: string,
  name: string,
  goal = "",
  velocityTarget = 21,
) {
  return invoke<Sprint>("create_sprint", {
    request: { project_id: projectId, name, goal, velocity_target: velocityTarget },
  });
}

export async function startSprint(sprintId: string) {
  return invoke<Sprint>("start_sprint", { sprintId });
}

export async function planSprint(sprintId: string) {
  return invoke<number>("plan_sprint_cmd", { sprintId });
}

export async function closeSprint(sprintId: string) {
  return invoke<Sprint>("close_sprint", { sprintId });
}

export async function setDefaultPmAgent(agentId: string | null) {
  return invoke<string | null>("set_default_pm_agent", { agentId });
}

export async function estimateWorkExecutionCost(workNodeId: string) {
  return invoke<WorkExecutionCostEstimate>("estimate_work_execution_cost", { workNodeId });
}

export async function runWorkExecution(workNodeId: string) {
  return invoke<ExecutionRun>("run_work_execution", { workNodeId });
}

export async function runBatchExecutions() {
  return invoke<BatchExecutionResult>("run_batch_executions");
}

export async function approveDeliverable(workNodeId: string) {
  return invoke<WorkNode>("approve_deliverable", { workNodeId });
}

export async function listExecutionRuns() {
  return invoke<ExecutionRun[]>("list_execution_runs");
}