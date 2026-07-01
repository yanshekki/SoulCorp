import type { PlayMode } from "../types/game";

export const EVENT_CHANCE_PRESETS = [0.05, 0.1, 0.15, 0.2, 0.25] as const;

export const DEFAULT_EVENT_CHANCE = 0.15;

export type PlayModeColumn = {
  id: PlayMode;
  title: string;
  tagline: string;
  highlights: string[];
};

export const PLAY_MODE_COLUMNS: PlayModeColumn[] = [
  {
    id: "game",
    title: "Game Mode",
    tagline: "High-realism simulation with Fate weaving AI-driven office drama.",
    highlights: [
      "Fate appears as a visible agent in your office",
      "Random events use your default AI API and bill tokens",
      "Events reference your company, agents, and relationships",
      "You choose how often Fate intervenes (5–25%)",
    ],
  },
  {
    id: "work",
    title: "Work Mode",
    tagline: "Zero random events — pure productivity for real tasks.",
    highlights: [
      "No surprise morale or token swings from Fate",
      "Meetings, workspace, gigs, and billing run normally",
      "Agents focus on delivery without narrative interruptions",
      "Switch back to Game Mode anytime in Settings",
    ],
  },
];

export const FATE_EXAMPLE_EVENT =
  "Fate might write: \"After Kai's new HR policy, Mira's thread goes viral — inbound leads spike while the engineering standup derails.\"";