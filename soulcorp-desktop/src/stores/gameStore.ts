import { create } from "zustand";
import { EMPTY_FINANCE } from "../utils/companyState";
import type {
  Achievement,
  AgentRecord,
  CompanySummary,
  Ending,
  FinanceState,
  GameEvent,
  GameSettings,
  HubStatus,
  MeetingSnapshot,
  SidebarPanel,
  TierBenefits,
} from "../types/game";
import type { CompanyVisualDesign } from "../types/visualDesign";
import { EMPTY_VISUAL_DESIGN } from "../types/visualDesign";
import type { Agent, Building, SimulationState } from "../types/world";

interface GameStore {
  companyName: string;
  companyIndustry: string;
  companyTagline: string;
  companies: CompanySummary[];
  activeCompanyId: string | null;
  showCreateCompany: boolean;
  onboardingCompleted: boolean;
  onboardingReady: boolean;
  statusMessage: string;
  activePanel: SidebarPanel;
  agents: Agent[];
  agentRecords: AgentRecord[];
  buildings: Building[];
  selectedBuilding: Building | null;
  isPaused: boolean;
  simulation: SimulationState;
  finance: FinanceState;
  settings: GameSettings;
  events: GameEvent[];
  activeMeeting: MeetingSnapshot | null;
  achievements: Achievement[];
  endings: Ending[];
  hubStatus: HubStatus;
  tierBenefits: TierBenefits;
  visualDesign: CompanyVisualDesign;
  setStatusMessage: (message: string) => void;
  setAgents: (agents: Agent[]) => void;
  setAgentRecords: (records: AgentRecord[]) => void;
  selectBuilding: (building: Building | null) => void;
  togglePause: () => void;
  setSimulation: (simulation: Partial<SimulationState>) => void;
  setFinance: (finance: FinanceState) => void;
  setSettings: (settings: GameSettings) => void;
  setEvents: (events: GameEvent[]) => void;
  prependEvent: (event: GameEvent) => void;
  setActivePanel: (panel: SidebarPanel) => void;
  setActiveMeeting: (meeting: MeetingSnapshot | null) => void;
  setAchievements: (achievements: Achievement[]) => void;
  setEndings: (endings: Ending[]) => void;
  setHubStatus: (hubStatus: HubStatus) => void;
  setTierBenefits: (tierBenefits: TierBenefits) => void;
  setBuildings: (buildings: Building[]) => void;
  setCompanyName: (companyName: string) => void;
  setCompanyIndustry: (companyIndustry: string) => void;
  setCompanyTagline: (companyTagline: string) => void;
  setCompanies: (companies: CompanySummary[]) => void;
  setActiveCompanyId: (companyId: string | null) => void;
  setShowCreateCompany: (show: boolean) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setOnboardingReady: (ready: boolean) => void;
  setVisualDesign: (visualDesign: CompanyVisualDesign) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  companyName: "",
  companyIndustry: "",
  companyTagline: "",
  companies: [],
  activeCompanyId: null,
  showCreateCompany: false,
  onboardingCompleted: false,
  onboardingReady: false,
  statusMessage: "Initializing agent systems...",
  activePanel: "office",
  agents: [],
  agentRecords: [],
  buildings: [],
  selectedBuilding: null,
  isPaused: true,
  simulation: {
    tick: 0,
    agentsActive: 0,
    dayNumber: 0,
  },
  finance: EMPTY_FINANCE,
  settings: {
    random_events_enabled: true,
    event_mode: "fun",
    god_mode_enabled: true,
    ai_provider: "mock",
    ollama_base_url: "http://127.0.0.1:11434",
    ollama_model: "llama3.2",
    openai_base_url: "https://api.openai.com/v1",
    openai_api_key: "",
    openai_model: "gpt-4o-mini",
    grok_base_url: "https://api.x.ai/v1",
    grok_api_key: "",
    grok_model: "grok-2-latest",
    claude_base_url: "https://api.anthropic.com/v1",
    claude_api_key: "",
    claude_model: "claude-3-5-sonnet-latest",
    meeting_turns_per_agent: 3,
    meeting_llm_fallback: true,
    pure_local_mode: false,
    pixel_filter_enabled: false,
    low_power_mode: false,
    backup_interval_minutes: 30,
  },
  events: [],
  activeMeeting: null,
  achievements: [],
  endings: [],
  hubStatus: {
    connected: false,
    base_url: "https://soulmd-hub.ysk.hk",
    user_tier: "free",
    soul_balance: 0,
    soul_staked: 0,
    near_wallet_address: null,
    pure_local_mode: false,
    pending_queue_items: 0,
    last_sync_at: null,
  },
  visualDesign: EMPTY_VISUAL_DESIGN,
  tierBenefits: {
    tier: "free",
    platform_fee_percent: 10,
    max_agents: 50,
    cloud_sync_enabled: false,
    priority_gig_matching: false,
    event_foresight_days: 0,
    white_label_export: false,
    executive_lounge: false,
    custom_departments: false,
    ai_co_ceo: false,
  },
  setStatusMessage: (message) => set({ statusMessage: message }),
  setAgents: (agents) => set({ agents }),
  setAgentRecords: (records) => set({ agentRecords: records }),
  selectBuilding: (building) => set({ selectedBuilding: building }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setSimulation: (simulation) =>
    set((state) => ({
      simulation: { ...state.simulation, ...simulation },
    })),
  setFinance: (finance) => set({ finance }),
  setSettings: (settings) => set({ settings }),
  setEvents: (events) => set({ events }),
  prependEvent: (event) =>
    set((state) => ({ events: [event, ...state.events].slice(0, 8) })),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setActiveMeeting: (meeting) => set({ activeMeeting: meeting }),
  setAchievements: (achievements) => set({ achievements }),
  setEndings: (endings) => set({ endings }),
  setHubStatus: (hubStatus) => set({ hubStatus }),
  setTierBenefits: (tierBenefits) => set({ tierBenefits }),
  setBuildings: (buildings) => set({ buildings }),
  setCompanyName: (companyName) => set({ companyName }),
  setCompanyIndustry: (companyIndustry) => set({ companyIndustry }),
  setCompanyTagline: (companyTagline) => set({ companyTagline }),
  setCompanies: (companies) => set({ companies }),
  setActiveCompanyId: (activeCompanyId) => set({ activeCompanyId }),
  setShowCreateCompany: (showCreateCompany) => set({ showCreateCompany }),
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
  setOnboardingReady: (ready) => set({ onboardingReady: ready }),
  setVisualDesign: (visualDesign) => set({ visualDesign }),
}));