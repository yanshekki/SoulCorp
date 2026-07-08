export type PlayMode = "game" | "work";
export type SidebarPanel =
  | "office"
  | "workspace"
  | "meeting"
  | "projects"
  | "design_studio"
  | "finance"
  | "marketplace"
  | "departments"
  | "recruitment"
  | "agents"
  | "tier"
  | "executive"
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
  executive_lounge?: boolean;
}

export interface ForesightEvent {
  id: string;
  title: string;
  description: string;
  tone: string;
  expected_day: number;
  confidence: number;
  morale_delta: number;
  cash_delta: number;
}

export interface MoraleHeatmapEntry {
  agent_id: string;
  name: string;
  department: string;
  morale: number;
  energy: number;
  risk_band: string;
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
  submitted_at?: string | null;
  completed_at?: string | null;
  qc_score?: number | null;
  qc_notes?: string | null;
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
  custom_departments: boolean;
  ai_co_ceo: boolean;
}

export interface CustomDepartment {
  id: string;
  name: string;
  display_name: string;
  sop: string;
  brand_color: string;
  accent_color: string;
  building_id: string;
  created_at: string;
  parent_department_id?: string | null;
  head_agent_id?: string | null;
}

export interface DepartmentListEntry extends CustomDepartment {
  member_count: number;
  head_agent_name?: string | null;
}

export interface DepartmentsSnapshot {
  departments: DepartmentListEntry[];
  buildings: CustomDepartmentBuilding[];
}

export interface OrgChartNode {
  agent_id: string;
  name: string;
  role: string;
  department: string;
  reports_to?: string | null;
  manages_department?: string | null;
  children: OrgChartNode[];
}

export interface OrgChartSnapshot {
  roots: OrgChartNode[];
  unassigned: OrgChartNode[];
}

export interface CustomDepartmentBuilding {
  id: string;
  name: string;
  department: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  roof_color: string;
  accent_color: string;
  description: string;
}

export interface DepartmentAiConfig {
  department: string;
  ai_provider?: string | null;
  agent_runtime_mode?: string | null;
}

export interface BrainResolutionPreview {
  agent_id: string;
  department: string;
  meeting_brain_id: string;
  meeting_brain_label: string;
  meeting_provider: string;
  execution_runtime_id: string;
  execution_runtime_label: string;
}

export interface CompanyDepartmentsSnapshot {
  builtin: string[];
  custom: CustomDepartment[];
  buildings: CustomDepartmentBuilding[];
  department_ai_providers?: DepartmentAiConfig[];
}

export interface CoCeoStatus {
  available: boolean;
  spawned: boolean;
  agent_id?: string | null;
  agent_name?: string | null;
  autonomy_enabled: boolean;
  last_briefing_at?: string | null;
  last_directive?: string | null;
  directives_applied: number;
}

export interface CoCeoDirective {
  id: string;
  title: string;
  description: string;
  target_department: string;
  project_progress_delta: number;
  morale_delta: number;
}

export interface CoCeoBriefing {
  summary: string;
  provider: string;
  directives: CoCeoDirective[];
  generated_at: string;
}

export interface RecruitmentCandidate {
  id: string;
  soul_id?: number | null;
  name: string;
  headline: string;
  /** Job title from soulmd-hub listing (stored on AgentRecord.role when hired). */
  job_role: string;
  skills: string[];
  vibe: string;
  verified: boolean;
  hourly_rate_usdt: number;
  soul_md_content?: string | null;
  file_type?: "single_md" | "full_soul_folder" | string | null;
  compatibility_score?: number | null;
  skill_overlap?: string[] | null;
  department_fit?: string | null;
  projected_morale_delta?: number | null;
}

export interface RelationshipGraphNode {
  agent_id: string;
  name: string;
  department: string;
  morale: number;
  connection_count: number;
}

export interface RelationshipGraphEdge {
  from_agent_id: string;
  to_agent_id: string;
  relationship_type: string;
  score: number;
  label: string;
}

export interface RelationshipGraph {
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
}

export interface CandidateCompatibility {
  candidate_id: string;
  name: string;
  compatibility_score: number;
  department_fit: string;
  skill_overlap: string[];
  projected_morale_delta: number;
  risk_band: string;
}

export interface RecruitmentAnalytics {
  team_size: number;
  average_morale: number;
  average_energy: number;
  skill_gaps: string[];
  agents_hired: number;
  interviews_started: number;
  priority_matching: boolean;
  candidate_scores: CandidateCompatibility[];
}

export interface BudgetAllocations {
  compute_pct: number;
  salaries_pct: number;
  marketing_pct: number;
  rnd_pct: number;
}

export type TokenBudgetPeriodType =
  | "none"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export interface TokenBudgetPolicy {
  period_limit: number;
  period_type: TokenBudgetPeriodType;
  period_days?: number;
}

export interface DepartmentTokenWallet {
  balance: number;
  allocated: number;
  /** Lifetime usage — never resets. */
  spent: number;
  period_limit?: number;
  period_type?: TokenBudgetPeriodType;
  period_days?: number;
  period_spent?: number;
  period_started_at?: string | null;
}

export interface AgentTokenWallet {
  balance: number;
  allocated: number;
  /** Lifetime usage — never resets. */
  spent: number;
  period_limit?: number;
  period_type?: TokenBudgetPeriodType;
  period_days?: number;
  period_spent?: number;
  period_started_at?: string | null;
}

export interface TokenEconomy {
  company_balance: number;
  monthly_burn_tokens: number;
  monthly_inflow_tokens: number;
  allocations: BudgetAllocations;
  departments: Record<string, DepartmentTokenWallet>;
  agents: Record<string, AgentTokenWallet>;
  company_starved: boolean;
}

/** @deprecated Use TokenEconomy — kept for store key compatibility */
export type FinanceState = TokenEconomy;

export interface TokenUsageEntry {
  id: string;
  at: string;
  source: string;
  provider: string;
  agent_id?: string | null;
  department: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  usage_source: string;
}

export interface TokenEconomySnapshot {
  economy: TokenEconomy;
  total_tokens: number;
  ledger: TokenUsageEntry[];
}

export interface DepartmentAllocationRequest {
  department: string;
  amount: number;
}

export interface AgentAllocationRequest {
  agent_id: string;
  amount: number;
}

export interface TokenBudgetPolicyRequest {
  period_limit: number;
  period_type: TokenBudgetPeriodType;
  period_days?: number;
}

export interface DepartmentTokenBudgetRequest {
  department: string;
  policy: TokenBudgetPolicyRequest;
}

export interface AgentTokenBudgetRequest {
  agent_id: string;
  policy: TokenBudgetPolicyRequest;
}

export interface MeetingTurnCostEstimate {
  estimated_tokens: number;
  affordable: boolean;
  message: string;
}

export interface InternalProject {
  id: string;
  title: string;
  progress: number;
  priority: number;
  owner_department: string;
  description?: string;
  pm_agent_id?: string | null;
  active_sprint_id?: string | null;
  default_cycle_days?: number;
}

export type WorkNodeKind = "program" | "epic" | "story" | "task";
export type WorkNodeStatus =
  | "backlog"
  | "ready"
  | "in_sprint"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked";
export type SprintStatus = "planning" | "active" | "review" | "closed";
export type DirectiveTarget = "department" | "agent" | "project";
export type DirectiveStatus = "open" | "routed" | "executing" | "done" | "cancelled";
export type DirectiveSource = "ceo" | "meeting" | "co_ceo" | "marketplace";
export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "throttled";

export interface WorkNode {
  id: string;
  parent_id?: string | null;
  project_id: string;
  kind: WorkNodeKind;
  title: string;
  description: string;
  status: WorkNodeStatus;
  priority: number;
  story_points: number;
  backlog_rank: number;
  assignee_agent_id?: string | null;
  owner_pm_agent_id?: string | null;
  department: string;
  sprint_id?: string | null;
  depends_on: string[];
  acceptance_criteria: string[];
  linked_workspace_page_id?: string | null;
  linked_gig_contract_id?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal: string;
  cycle_length_days: number;
  start_day: number;
  end_day: number;
  status: SprintStatus;
  committed_story_ids: string[];
  velocity_target: number;
}

export interface CommandCenterAlert {
  severity: string;
  message: string;
  action_ref?: string | null;
}

export interface CommandCenterOverview {
  day_number: number;
  token_pool: number;
  monthly_burn: number;
  monthly_payroll: number;
  avg_morale: number;
  avg_energy: number;
  open_directives: number;
  blocked_tasks: number;
  failed_runs: number;
  throttled_runs: number;
  unassigned_sprint_tasks: number;
  active_sprint_name?: string | null;
  burndown_remaining: number;
  burndown_total: number;
  execution_paused: boolean;
  alerts: CommandCenterAlert[];
}

export interface DirectivePreviewNode {
  kind: WorkNodeKind;
  title: string;
  description: string;
  story_points: number;
  department: string;
  children: DirectivePreviewNode[];
}

export interface BatchExecutionResult {
  attempted: number;
  succeeded: number;
  failed: number;
  messages: string[];
}

export interface Directive {
  id: string;
  title: string;
  description: string;
  source: DirectiveSource | string;
  target: DirectiveTarget;
  target_ref: string;
  status: DirectiveStatus;
  spawned_node_ids: string[];
  created_at: string;
}

export interface ExecutionRun {
  id: string;
  work_node_id: string;
  agent_id: string;
  status: ExecutionStatus;
  provider: string;
  estimated_tokens: number;
  actual_tokens: number;
  deliverable_page_id?: string | null;
  summary: string;
  error?: string | null;
  started_at: string;
  finished_at?: string | null;
}

export interface WorkTreeNode {
  node: WorkNode;
  children: WorkTreeNode[];
}

export interface WorkTreeSnapshot {
  project_id: string;
  nodes: WorkTreeNode[];
  flat: WorkNode[];
}

export interface ScrumBoardSnapshot {
  project_id: string;
  active_sprint?: Sprint | null;
  backlog: WorkNode[];
  sprint_items: WorkNode[];
  in_progress: WorkNode[];
  in_review: WorkNode[];
  done: WorkNode[];
  burndown_remaining: number;
  burndown_total: number;
}

export interface AgentInboxEntry {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  department: string;
  assigned_points: number;
  tasks: WorkNode[];
}

export interface ScrumSnapshot {
  projects: InternalProject[];
  tree?: WorkTreeSnapshot | null;
  board?: ScrumBoardSnapshot | null;
  directives: Directive[];
  inboxes: AgentInboxEntry[];
  execution_runs: ExecutionRun[];
  default_pm_agent_id?: string | null;
}

export interface WorkExecutionCostEstimate {
  estimated_tokens: number;
  affordable: boolean;
  message: string;
}

/** Editor-visible soul.md plus optional hub-compiled AI prompt (not shown in UI). */
export interface SoulProfile {
  name: string;
  personality: string;
  values: string;
  communication_style: string;
  raw_content: string;
  system_prompt_source?: string | null;
  hub_file_type?: string | null;
}

export interface HubSoulImportResult {
  display_md: string;
  system_prompt: string;
  file_type: string;
  description: string;
  name: string;
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
  skills?: string[];
  soul?: SoulProfile | null;
  ai_provider?: string | null;
  agent_runtime_mode?: string | null;
  agent_kind?: string | null;
  reports_to?: string | null;
  manages_department?: string | null;
}

export interface CompanySummary {
  id: string;
  name: string;
  industry: string;
  tagline: string;
  created_at: string;
  day_number: number;
  agent_count: number;
  onboarding_completed: boolean;
}

export interface CompanyListResponse {
  active_company_id: string | null;
  companies: CompanySummary[];
}

export type AgentSlotMode = "preset" | "recruit";

export interface AgentSlotSetup {
  preset_id: string;
  mode: AgentSlotMode;
  soul_md_content?: string | null;
  candidate_id?: string | null;
  role?: string | null;
  department?: string | null;
  offered_salary?: number | null;
  system_prompt_source?: string | null;
  soul_md_edited?: boolean;
}

export type ProjectSetupMode = "preset" | "custom";

export interface CustomProjectSetup {
  title: string;
  description: string;
  owner_department: string;
}

export interface CreateCompanyRequest {
  company_name: string;
  industry: string;
  tagline: string;
  play_mode: PlayMode;
  pure_local_mode: boolean;
  random_events_enabled: boolean;
  random_event_chance: number;
  agent_roster: AgentSlotSetup[];
  project_setup_mode?: ProjectSetupMode;
  custom_project?: CustomProjectSetup | null;
}

export interface SwitchCompanyResponse {
  active_company_id: string;
  company: CompanySummary;
}

export interface OnboardingState {
  company_name: string;
  company_industry: string;
  company_tagline: string;
  completed: boolean;
}

export interface CompleteOnboardingRequest {
  company_name: string;
  company_industry: string;
  company_tagline: string;
  play_mode: PlayMode;
  pure_local_mode: boolean;
  random_events_enabled: boolean;
  random_event_chance: number;
  agent_roster: AgentSlotSetup[];
  project_setup_mode?: ProjectSetupMode;
  custom_project?: CustomProjectSetup | null;
}

export interface GameSettings {
  play_mode: PlayMode;
  random_events_enabled: boolean;
  random_event_chance: number;
  god_mode_enabled: boolean;
  ai_provider: string;
  ollama_base_url: string;
  ollama_model: string;
  openai_base_url: string;
  openai_api_key: string;
  openai_model: string;
  grok_base_url: string;
  grok_api_key: string;
  grok_model: string;
  claude_base_url: string;
  claude_api_key: string;
  claude_model: string;
  meeting_turns_per_agent: number;
  meeting_llm_fallback: boolean;
  pure_local_mode: boolean;
  pixel_filter_enabled: boolean;
  crt_filter_enabled: boolean;
  low_power_mode: boolean;
  backup_interval_minutes: number;
  music_enabled: boolean;
  music_volume: number;
  sfx_enabled: boolean;
  sfx_volume: number;
  scrum_auto_schedule?: boolean;
  scrum_auto_execute?: boolean;
  scrum_execution_paused?: boolean;
  scrum_min_tokens_guard?: number;
  scrum_max_executions_per_tick?: number;
  scrum_worker_enabled?: boolean;
  scrum_worker_interval_secs?: number;
  scrum_auto_route?: boolean;
  scrum_auto_approve?: boolean;
  scrum_parallel_agents?: boolean;
  scrum_auto_retry_blocked?: boolean;
  scrum_max_blocked_retries?: number;
  scrum_use_agent_tools?: boolean;
  orchestrator_enabled?: boolean;
  orchestrator_interval_secs?: number;
  orchestrator_idle_interval_secs?: number;
  orchestrator_urgent_interval_secs?: number;
  orchestrator_auto_meeting?: boolean;
  orchestrator_auto_spawn_co_ceo?: boolean;
  orchestrator_max_directives_per_cycle?: number;
  agent_runtime_mode?: string;
  openclaw_binary_path?: string;
  openclaw_use_local?: boolean;
  openclaw_prefer_gateway?: boolean;
  openclaw_default_agent_id?: string;
  openclaw_timeout_secs?: number;
  agent_runtime_fallback_to_llm?: boolean;
  agent_runtime_custom_binary?: string;
  agent_runtime_custom_adapter?: string;
  agent_runtime_allow_cli_env_keys?: boolean;
  orchestrator_auto_accept_gigs?: boolean;
  orchestrator_max_active_gigs?: number;
  orchestrator_auto_start_gigs?: boolean;
  orchestrator_auto_hub_pull?: boolean;
  hub_auto_pull_interval_secs?: number;
  orchestrator_auto_complete_gigs?: boolean;
  orchestrator_auto_recruit?: boolean;
}

export interface AutomationReadinessItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface AutomationReadiness {
  items: AutomationReadinessItem[];
  ready: boolean;
}

export interface AutomationStatus {
  scrum_worker_last_tick_at?: string | null;
  scrum_worker_log: string[];
  orchestrator_last_tick_at?: string | null;
  orchestrator_log: string[];
  orchestrator_directives_total: number;
  orchestrator_meetings_total: number;
  sync_queue_pending: number;
  hub_last_pull_at?: string | null;
  company_vision: string;
  parallel_llm_enabled: boolean;
  openclaw_available: boolean;
  openclaw_version?: string | null;
  openclaw_message: string;
  active_execution_runtimes?: string[];
  readiness: AutomationReadiness;
}

export interface RuntimeCatalogEntry {
  id: string;
  label: string;
  category: string;
  adapter: string;
  default_binary: string;
  docs_url: string;
  capabilities: string[];
  layers?: string[];
  transport?: string;
  api_provider_id?: string | null;
}

export interface AdapterCatalogEntry {
  id: string;
  label: string;
}

export interface RuntimeCatalog {
  version: number;
  adapters: AdapterCatalogEntry[];
  runtimes: RuntimeCatalogEntry[];
}

export interface RuntimeProbeSummary {
  runtime_id: string;
  runtime_label: string;
  category: string;
  binary_available: boolean;
  message: string;
}

export interface AgentRuntimeStatus {
  runtime_mode: string;
  runtime_id: string;
  runtime_label: string;
  adapter: string;
  binary_path: string;
  binary_available: boolean;
  version?: string | null;
  agent_command_available: boolean;
  gateway_healthy: boolean;
  use_local: boolean;
  prefer_gateway: boolean;
  default_agent_id: string;
  timeout_secs: number;
  message: string;
}

export interface AgentRuntimeTestResult {
  ok: boolean;
  transport?: string | null;
  preview: string;
  message: string;
}

export type OpenClawStatus = AgentRuntimeStatus;
export type OpenClawTestResult = AgentRuntimeTestResult;

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

export interface DeployStatus {
  git_available: boolean;
  git_version?: string | null;
  gh_available: boolean;
  gh_version?: string | null;
  gh_authenticated: boolean;
  npx_available: boolean;
  vercel_cli_available: boolean;
  vercel_version?: string | null;
  netlify_cli_available: boolean;
  message: string;
  last_deploy_url?: string | null;
  last_deploy_at?: string | null;
  last_deploy_provider?: string | null;
}

export interface DeployResult {
  url?: string | null;
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
  narrator?: string | null;
  generated_by_ai?: boolean;
}

export interface MeetingMessage {
  speaker_id: string;
  speaker_name: string;
  content: string;
  provider?: string | null;
}

export interface MeetingAiStatus {
  configured_provider: string;
  active_provider: string;
  ollama_reachable: boolean;
  hub_configured: boolean;
  hub_reachable: boolean;
  ollama_model: string;
  ollama_base_url: string;
  meeting_turns_per_agent: number;
  fallback_enabled: boolean;
  message: string;
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
  active_provider: string;
  turns_per_agent: number;
  notes_page_id?: string | null;
}

export interface SimulationTickResult {
  tick: number;
  agents_active: number;
  day_number: number;
  token_balance: number;
  total_tokens: number;
  company_starved: boolean;
  message: string;
  event?: GameEvent | null;
}

export interface GodModeActionResult {
  action: string;
  message: string;
  day_number: number;
  token_balance: number;
  average_morale: number;
}

export interface GodModeLogEntry {
  id: string;
  action: string;
  message: string;
  day_number: number;
  reality_cost: number;
}