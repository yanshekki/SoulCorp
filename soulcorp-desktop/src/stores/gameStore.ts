import { create } from "zustand";
import { INITIAL_AGENTS, INITIAL_BUILDINGS } from "../data/initialWorld";
import type { Agent, Building, SimulationState } from "../types/world";

interface GameStore {
  companyName: string;
  statusMessage: string;
  agents: Agent[];
  buildings: Building[];
  selectedBuilding: Building | null;
  isPaused: boolean;
  simulation: SimulationState;
  setStatusMessage: (message: string) => void;
  setAgents: (agents: Agent[]) => void;
  selectBuilding: (building: Building | null) => void;
  togglePause: () => void;
  setSimulation: (simulation: Partial<SimulationState>) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  companyName: "SoulCorp",
  statusMessage: "Initializing office world...",
  agents: INITIAL_AGENTS,
  buildings: INITIAL_BUILDINGS,
  selectedBuilding: null,
  isPaused: false,
  simulation: {
    tick: 0,
    agentsActive: INITIAL_AGENTS.length,
    dayNumber: 1,
  },
  setStatusMessage: (message) => set({ statusMessage: message }),
  setAgents: (agents) => set({ agents }),
  selectBuilding: (building) => set({ selectedBuilding: building }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setSimulation: (simulation) =>
    set((state) => ({
      simulation: { ...state.simulation, ...simulation },
    })),
}));