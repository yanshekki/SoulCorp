import { create } from "zustand";
import { INITIAL_AGENTS, INITIAL_BUILDINGS } from "../data/initialWorld";
import type {
  Achievement,
  AgentRecord,
  Ending,
  FinanceState,
  GameEvent,
  GameSettings,
  HubStatus,
  MeetingSnapshot,
  SidebarPanel,
  TierBenefits,
} from "../types/game";
import type { Agent, Building, SimulationState } from "../types/world";

interface GameStore {
  companyName: string;
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
  setOnboardingCompleted: (completed: boolean) => void;
  setOnboardingReady: (ready: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  companyName: "SoulCorp",
  onboardingCompleted: true,
  onboardingReady: false,
  statusMessage: "Initializing agent systems...",
  activePanel: "office",
  agents: INITIAL_AGENTS,
  agentRecords: [],
  buildings: INITIAL_BUILDINGS,
  selectedBuilding: null,
  isPaused: false,
  simulation: {
    tick: 0,
    agentsActive: INITIAL_AGENTS.length,
    dayNumber: 1,
  },
  finance: {
    cash_balance: 10000,
    compute_tokens: 5000,
    monthly_burn: 1200,
    monthly_revenue: 1800,
    allocations: {
      compute_pct: 40,
      salaries_pct: 35,
      marketing_pct: 15,
      rnd_pct: 10,
    },
    compute_starved: false,
    cash_crisis: false,
  },
  settings: {
    random_events_enabled: true,
    event_mode: "fun",
    god_mode_enabled: true,
    ai_provider: "mock",
    ollama_base_url: "http://127.0.0.1:11434",
    ollama_model: "llama3.2",
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
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
  setOnboardingReady: (ready) => set({ onboardingReady: ready }),
}));