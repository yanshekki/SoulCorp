import { create } from "zustand";

interface GameStore {
  companyName: string;
  statusMessage: string;
  setStatusMessage: (message: string) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  companyName: "SoulCorp",
  statusMessage: "Initializing...",
  setStatusMessage: (message) => set({ statusMessage: message }),
}));