import type { PlayMode } from "../types/game";

export const EVENT_CHANCE_PRESETS = [0.05, 0.1, 0.15, 0.2, 0.25] as const;

export const DEFAULT_EVENT_CHANCE = 0.15;

export type PlayModeColumn = {
  id: PlayMode;
  titleKey: string;
  taglineKey: string;
  highlightKeys: string[];
};

export const PLAY_MODE_COLUMNS: PlayModeColumn[] = [
  {
    id: "game",
    titleKey: "playMode.game.title",
    taglineKey: "playMode.game.tagline",
    highlightKeys: [
      "playMode.game.h1",
      "playMode.game.h2",
      "playMode.game.h3",
      "playMode.game.h4",
    ],
  },
  {
    id: "work",
    titleKey: "playMode.work.title",
    taglineKey: "playMode.work.tagline",
    highlightKeys: [
      "playMode.work.h1",
      "playMode.work.h2",
      "playMode.work.h3",
      "playMode.work.h4",
    ],
  },
];

export const FATE_EXAMPLE_EVENT =
  "Fate might write: \"After Kai's new HR policy, Mira's thread goes viral — inbound leads spike while the engineering standup derails.\"";
