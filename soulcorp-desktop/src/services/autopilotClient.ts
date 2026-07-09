import { invoke } from "@tauri-apps/api/core";

export type AutopilotInterventionMode = "auto" | "gate_directives" | "gate_deliverables" | "paused";

export type PendingGateKind = "directive" | "deliverable" | "meeting_summary" | "story_brief";

export interface AutopilotPhaseCounts {
  open_directives: number;
  stories_without_brief: number;
  unassigned_tasks: number;
  in_progress_tasks: number;
  in_review_tasks: number;
  done_tasks: number;
  active_executions: number;
  active_agents: number;
}

export interface AutopilotPipelineStep {
  phase: string;
  label: string;
  count: number;
  active: boolean;
  last_action_at?: string | null;
}

export interface PendingGate {
  id: string;
  kind: PendingGateKind;
  title: string;
  detail: string;
  created_at: string;
  workspace_page_id?: string | null;
  work_node_id?: string | null;
  directive_id?: string | null;
  meeting_id?: string | null;
}

export interface AutopilotIntervention {
  id: string;
  action: string;
  item_kind: string;
  item_id: string;
  comment: string;
  timestamp: string;
}

export interface AutopilotSnapshot {
  phase: string;
  phase_label: string;
  stall_reason?: string | null;
  intervention_mode: AutopilotInterventionMode;
  worker_enabled: boolean;
  execution_paused: boolean;
  readiness_ready: boolean;
  next_action: string;
  last_worker_tick_at?: string | null;
  last_orchestrator_tick_at?: string | null;
  counts: AutopilotPhaseCounts;
  pipeline_steps: AutopilotPipelineStep[];
  pending_gates: PendingGate[];
  recent_interventions: AutopilotIntervention[];
  deliverables_this_week: number;
  gigs_advanced_this_week: number;
  updated_at: string;
}

export async function getAutopilotSnapshot(): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("get_autopilot_snapshot");
}

export async function ceoApproveDirective(directiveId: string): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("ceo_approve_directive_cmd", { directiveId });
}

export async function ceoRejectDirective(itemId: string, reason = ""): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("ceo_reject_directive_cmd", {
    request: { item_id: itemId, reason },
  });
}

export async function ceoApproveDeliverable(workNodeId: string): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("ceo_approve_deliverable_cmd", { workNodeId });
}

export async function ceoRejectDeliverable(workNodeId: string, reason = ""): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("ceo_reject_deliverable_cmd", {
    request: { item_id: workNodeId, reason },
  });
}

export async function ceoCommentOnItem(
  itemKind: string,
  itemId: string,
  comment: string,
): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("ceo_comment_on_item_cmd", {
    request: { item_kind: itemKind, item_id: itemId, comment },
  });
}

export async function dismissMeetingGate(meetingId: string): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("dismiss_meeting_gate_cmd", { meetingId });
}

export async function setAutopilotInterventionMode(
  mode: AutopilotInterventionMode,
): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("set_autopilot_intervention_mode", {
    request: { mode },
  });
}

export async function setFullAutopilot(enabled: boolean): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("set_full_autopilot", {
    request: { enabled },
  });
}

export async function pauseAutopilot(): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("pause_autopilot");
}

export async function resumeAutopilot(): Promise<AutopilotSnapshot> {
  return invoke<AutopilotSnapshot>("resume_autopilot");
}