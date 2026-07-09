export type ActivitySource = "execution" | "meeting" | "workspace" | "worker" | "orchestrator";
export type BrainLayer = "meeting" | "execution";
export type SessionStatus = "active" | "completed" | "failed";
export type ActivityKind =
  | "session_start"
  | "session_end"
  | "status_change"
  | "step_start"
  | "step_complete"
  | "token_delta"
  | "terminal_line"
  | "tool_action"
  | "work_assigned"
  | "deliverable_ready"
  | "error"
  | "autopilot_phase_change";

export interface AgentActivitySession {
  id: string;
  agent_id: string;
  agent_name: string;
  source: ActivitySource;
  brain_layer: BrainLayer;
  brain_label: string;
  transport: string;
  work_node_id?: string | null;
  work_node_title?: string | null;
  meeting_id?: string | null;
  run_id?: string | null;
  status: SessionStatus;
  started_at: string;
  finished_at?: string | null;
}

export interface AgentActivityEvent {
  id: string;
  session_id: string;
  agent_id: string;
  kind: ActivityKind;
  timestamp: string;
  step?: string | null;
  content_delta?: string | null;
  content_full?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentActivityPayload {
  event: AgentActivityEvent;
  session?: AgentActivitySession | null;
}

export interface AgentActivitySnapshot {
  sessions: AgentActivitySession[];
  events: AgentActivityEvent[];
}