import { create } from "zustand";
import { INITIAL_AGENTS, INITIAL_BUILDINGS } from "../data/initialWorld";
import type {
  Achievement,
  AgentRecord,
  Ending,
  FinanceState,
  GameEvent,
  GameSettings,
  MeetingSnapshot,
  SidebarPanel,
} from "../types/game";
import type { Agent, Building, SimulationState } from "../types/world";

interface GameStore {
  companyName: string;
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
}

export const useGameStore = create<GameStore>((set) => ({
  companyName: "SoulCorp",
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
  },
  settings: {
    random_events_enabled: true,
    event_mode: "fun",
    god_mode_enabled: true,
    ai_provider: "mock",
    pure_local_mode: false,
    pixel_filter_enabled: false,
    low_power_mode: false,
    backup_interval_minutes: 30,
  },
  events: [],
  activeMeeting: null,
  achievements: [],
  endings: [],
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
}));