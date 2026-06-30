export type EventMode = "fun" | "balanced" | "serious";
export type SidebarPanel =
  | "office"
  | "workspace"
  | "meeting"
  | "finance"
  | "settings"
  | "god_mode";

export interface SoulProfile {
  name: string;
  personality: string;
  values: string;
  communication_style: string;
  raw_content: string;
}

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  department: string;
  morale: number;
  energy: number;
  salary: number;
  status: string;
  soul?: SoulProfile | null;
}

export interface FinanceState {
  cash_balance: number;
  compute_tokens: number;
  monthly_burn: number;
  monthly_revenue: number;
}

export interface GameSettings {
  random_events_enabled: boolean;
  event_mode: EventMode;
  god_mode_enabled: boolean;
  ai_provider: string;
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  tone: string;
  morale_delta: number;
  cash_delta: number;
}

export interface MeetingMessage {
  speaker_id: string;
  speaker_name: string;
  content: string;
}

export interface MeetingSnapshot {
  id: string;
  meeting_type: string;
  participant_ids: string[];
  messages: MeetingMessage[];
  completed: boolean;
  morale_delta: number;
}

export interface SimulationTickResult {
  tick: number;
  agents_active: number;
  day_number: number;
  cash_balance: number;
  message: string;
  event?: GameEvent | null;
}

export interface GodModeActionResult {
  action: string;
  message: string;
  day_number: number;
  cash_balance: number;
  average_morale: number;
}