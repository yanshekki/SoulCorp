import { IS_V1, IS_V2 } from "./productEdition";

export { IS_V1, IS_V2 };

/** 3D office campus and WebGL scene */
export const showOffice3D = IS_V2;
/** 3D design studio editor */
export const showDesignStudio = IS_V2;
/** God Mode CEO cheats panel */
export const showGodMode = IS_V2;
/** Achievements and alternate endings */
export const showAchievements = IS_V2;
/** Play mode (game/work), random events, god mode settings */
export const showPlayModeSettings = IS_V2;
/** Scene-linked BGM and SFX */
export const showGameAudio = IS_V2;
/** Pause simulation overlay */
export const showPauseMenu = IS_V2;
/** Building click modal on campus */
export const showBuildingModal = IS_V2;
/** Fate / random event feed */
export const showEventFeed = IS_V2;
/** Fate pill and foresight UI */
export const showFateUI = IS_V2;
/** Pixel / CRT / low-power display settings */
export const showDisplaySettings = IS_V2;
/** Full audio settings section */
export const showAudioSettings = IS_V2;
/** Dev test mode seed button (shown in footer when import.meta.env.DEV) */
export const showTestMode = import.meta.env.DEV;
/** Day / tick simulation counters in status bar */
export const showSimulationChrome = IS_V2;
/** Agent morale / energy as game simulation metrics */
export const showAgentMorale = IS_V2;
/** Background day/tick simulation loop — v2 only; v1 uses real operational data */
export const simulationAutoRun = IS_V2;

export const defaultActivePanel = IS_V2 ? ("office" as const) : ("projects" as const);

export const appTagline = IS_V2 ? "AI Company Simulator" : "AI Company Platform";