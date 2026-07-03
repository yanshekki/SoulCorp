import {
  showAudioSettings,
  showDisplaySettings,
  showPlayModeSettings,
} from "./features";

export const ALL_SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "play", label: "Play mode" },
  { id: "display", label: "Display" },
  { id: "audio", label: "Audio" },
  { id: "cloud", label: "Cloud & hub" },
  { id: "ai", label: "AI providers" },
  { id: "meetings", label: "Meetings" },
  { id: "backup", label: "Backup & export" },
  { id: "deploy", label: "Deploy" },
] as const;

const HIDDEN_IN_V1 = new Set<string>([
  ...(showPlayModeSettings ? [] : ["play"]),
  ...(showDisplaySettings ? [] : ["display"]),
  ...(showAudioSettings ? [] : ["audio"]),
]);

export function getVisibleSettingsSections() {
  return ALL_SETTINGS_SECTIONS.filter((section) => !HIDDEN_IN_V1.has(section.id));
}