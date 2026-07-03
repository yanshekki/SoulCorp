import { useGameStore } from "../stores/gameStore";

/** Notify other scrum panels (Command Center ↔ Projects) to reload their snapshot. */
export function notifyScrumChanged(): void {
  useGameStore.getState().bumpScrumRevision();
}