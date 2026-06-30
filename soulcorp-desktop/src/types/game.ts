export type EventMode = "fun" | "balanced" | "serious";
export type SidebarPanel =
  | "office"
  | "workspace"
  | "meeting"
  | "finance"
  | "marketplace"
  | "recruitment"
  | "tier"
  | "achievements"
  | "settings"
  | "god_mode";

export interface HubGig {
  gig_id: number;
  title: string;
  description: string;
  budget_usdt: number;
  status: string;
  required_skills: string[];
}

export interface GigContract {
  contract_id: string;
  gig_id: number;
  title: string;
  description: string;
  budget_usdt: number;
  required_skills: string[];
  status: string;
  progress: number;
  payout_usdt: number;
  platform_fee_usdt: number;
  accepted_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface HubStatus {
  connected: boolean;
  base_url: string;
  user_tier: string;
  soul_balance: number;
  soul_staked: number;
  near_wallet_address?: string | null;
  pure_local_mode: boolean;
  pending_queue_items: number;
  last_sync_at?: string | null;
}

export interface NearUpgradeConfig {
  soul_contract_id: string;
  usdt_contract_id: string;
  usdc_contract_id: string;
  vip_amount_raw: string;
  pro_amount_raw: string;
  vip_amount_usd: string;
  pro_amount_usd: string;
  upgrade_page_url: string;
}

export interface ClaimNearUpgradeResult {
  tier: string;
  message: string;
  benefits: TierBenefits;
}

export interface HubSyncPull {
  tier: string;
  soul_balance: number;
  open_gigs: HubGig[];
}

export interface TierBenefits {
  tier: string;
  platform_fee_percent: number;
  max_agents?: number | null;
  cloud_sync_enabled: boolean;
  priority_gig_matching: boolean;
  event_foresight_days: number;
  white_label_export: boolean;
  executive_lounge: boolean;
}

export interface RecruitmentCandidate {
  id: string;
  soul_id?: number | null;
  name: string;
  headline: string;
  skills: string[];
  vibe: string;
  verified: boolean;
  hourly_rate_usdt: number;
  soul_md_content?: string | null;
}

export interface BudgetAllocations {
  compute_pct: number;
  salaries_pct: number;
  marketing_pct: number;
  rnd_pct: number;
}

export interface InternalProject {
  id: string;
  title: string;
  progress: number;
  priority: number;
  owner_department: string;
}

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
  allocations: BudgetAllocations;
  compute_starved: boolean;
  cash_crisis: boolean;
}

export interface OnboardingState {
  company_name: string;
  completed: boolean;
}

export interface CompleteOnboardingRequest {
  company_name: string;
  event_mode: EventMode;
  pure_local_mode: boolean;
  random_events_enabled: boolean;
}

export interface GameSettings {
  random_events_enabled: boolean;
  event_mode: EventMode;
  god_mode_enabled: boolean;
  ai_provider: string;
  pure_local_mode: boolean;
  pixel_filter_enabled: boolean;
  low_power_mode: boolean;
  backup_interval_minutes: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: string;
  unlocked: boolean;
  unlocked_at?: string | null;
}

export interface Ending {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlocked_at?: string | null;
}

export interface AchievementSnapshot {
  achievements: Achievement[];
  endings: Ending[];
  newly_unlocked: string[];
}

export interface ExportResult {
  path: string;
  format: string;
  message: string;
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
  outcome_summary?: string | null;
  project_progress_delta: number;
  revenue_delta: number;
}

export interface SimulationTickResult {
  tick: number;
  agents_active: number;
  day_number: number;
  cash_balance: number;
  compute_tokens: number;
  compute_starved: boolean;
  cash_crisis: boolean;
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

export interface GodModeLogEntry {
  id: string;
  action: string;
  message: string;
  day_number: number;
  reality_cost: number;
}