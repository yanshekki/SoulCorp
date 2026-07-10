import { create } from "zustand";
import { defaultActivePanel, IS_V1 } from "../config/features";
import { normalizePanelForEdition } from "../config/navigation";
import { EMPTY_FINANCE } from "../utils/companyState";
import type {
  Achievement,
  AgentRecord,
  CompanySummary,
  Ending,
  TokenEconomy,
  GameEvent,
  GameSettings,
  HubStatus,
  MeetingSnapshot,
  SidebarPanel,
  TierBenefits,
} from "../types/game";
import type { BuildMode, BuildTool } from "../types/buildMode";
import type { CompanyVisualDesign, InteriorZone, OfficeVisualConfig } from "../types/visualDesign";
import { EMPTY_VISUAL_DESIGN } from "../types/visualDesign";
import type { Agent, Building, SimulationState } from "../types/world";

export type WorldView = "campus" | "interior";
export type InteriorCameraMode = "iso" | "walk" | "render";

interface GameStore {
  companyName: string;
  companyIndustry: string;
  companyTagline: string;
  companies: CompanySummary[];
  activeCompanyId: string | null;
  /** Bumped after reloadGameState / company switch so panels refresh scoped data. */
  companyRevision: number;
  /** Bumped after scrum mutations so Command Center ↔ Projects stay in sync. */
  scrumRevision: number;
  showCreateCompany: boolean;
  onboardingCompleted: boolean;
  onboardingReady: boolean;
  statusMessage: string;
  activePanel: SidebarPanel;
  agents: Agent[];
  agentRecords: AgentRecord[];
  buildings: Building[];
  selectedBuilding: Building | null;
  worldView: WorldView;
  interiorBuildingId: string | null;
  selectedAgentId: string | null;
  hoveredDoorBuildingId: string | null;
  buildMode: BuildMode;
  buildTool: BuildTool;
  buildCatalogId: string | null;
  selectedFurnitureId: string | null;
  hoveredFurnitureId: string | null;
  buildDirty: boolean;
  buildSnapshot: OfficeVisualConfig | null;
  recentBuildCatalogIds: string[];
  inspectorExpanded: boolean;
  cameraTransition: number;
  interiorViewEpoch: number;
  interiorZoomNudge: number;
  /** Phase 2: iso overview vs walk perspective with wall peel */
  interiorCameraMode: InteriorCameraMode;
  interiorWalkFocusZone: InteriorZone | null;
  interiorWalkZone: InteriorZone;
  /** Phase 3: incremented to trigger one-shot interior screenshot capture. */
  interiorScreenshotEpoch: number;
  isPaused: boolean;
  simulation: SimulationState;
  finance: TokenEconomy;
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
  enterInterior: (buildingId: string) => void;
  exitInterior: () => void;
  selectAgent: (agentId: string | null) => void;
  setHoveredDoorBuildingId: (buildingId: string | null) => void;
  setBuildMode: (mode: BuildMode) => void;
  setBuildTool: (tool: BuildTool) => void;
  setBuildCatalogId: (catalogId: string | null) => void;
  setSelectedFurnitureId: (furnitureId: string | null) => void;
  setHoveredFurnitureId: (furnitureId: string | null) => void;
  setBuildDirty: (dirty: boolean) => void;
  toggleBuildMode: () => void;
  addRecentBuildCatalog: (catalogId: string) => void;
  setInspectorExpanded: (expanded: boolean) => void;
  setCameraTransition: (value: number) => void;
  nudgeInteriorZoom: (delta: number) => void;
  clearInteriorZoomNudge: () => void;
  setInteriorCameraMode: (mode: InteriorCameraMode) => void;
  requestInteriorWalkZone: (zone: InteriorZone) => void;
  clearInteriorWalkFocusZone: () => void;
  setInteriorWalkZone: (zone: InteriorZone) => void;
  requestInteriorScreenshot: () => void;
  togglePause: () => void;
  setIsPaused: (paused: boolean) => void;
  setSimulation: (simulation: Partial<SimulationState>) => void;
  setFinance: (finance: TokenEconomy) => void;
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
  bumpCompanyRevision: () => void;
  bumpScrumRevision: () => void;
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
  companyRevision: 0,
  scrumRevision: 0,
  showCreateCompany: false,
  onboardingCompleted: false,
  onboardingReady: false,
  statusMessage: "Initializing agent systems...",
  activePanel: defaultActivePanel,
  agents: [],
  agentRecords: [],
  buildings: [],
  selectedBuilding: null,
  worldView: "campus",
  interiorBuildingId: null,
  selectedAgentId: null,
  hoveredDoorBuildingId: null,
  buildMode: "play",
  buildTool: "place",
  buildCatalogId: null,
  selectedFurnitureId: null,
  hoveredFurnitureId: null,
  buildDirty: false,
  buildSnapshot: null,
  recentBuildCatalogIds: ["desk_open", "chair_office", "monitor", "plant_ficus"],
  inspectorExpanded: false,
  cameraTransition: 1,
  interiorViewEpoch: 0,
  interiorZoomNudge: 0,
  interiorCameraMode: "iso",
  interiorWalkFocusZone: null,
  interiorWalkZone: "office",
  interiorScreenshotEpoch: 0,
  isPaused: true,
  simulation: {
    tick: 0,
    agentsActive: 0,
    dayNumber: 0,
  },
  finance: EMPTY_FINANCE,
  settings: {
    play_mode: IS_V1 ? "work" : "game",
    random_events_enabled: !IS_V1,
    random_event_chance: 0.15,
    god_mode_enabled: false,
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
    deepseek_base_url: "https://api.deepseek.com/v1",
    deepseek_api_key: "",
    deepseek_model: "deepseek-chat",
    meeting_turns_per_agent: 3,
    meeting_llm_fallback: true,
    pure_local_mode: false,
    pixel_filter_enabled: false,
    crt_filter_enabled: false,
    low_power_mode: false,
    backup_interval_minutes: 30,
    music_enabled: true,
    music_volume: 0.25,
    sfx_enabled: true,
    sfx_volume: 0.45,
    agent_memory_compress_mode: "hybrid",
    agent_memory_compress_every_n_tasks: 3,
    agent_memory_max_chars: 4000,
    agent_memory_append_after_task: true,
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
    max_agents: null,
    cloud_sync_enabled: true,
    priority_gig_matching: true,
    event_foresight_days: 3,
    white_label_export: true,
    executive_lounge: true,
    custom_departments: true,
    ai_co_ceo: true,
  },
  setStatusMessage: (message) => set({ statusMessage: message }),
  setAgents: (agents) => set({ agents }),
  setAgentRecords: (records) => set({ agentRecords: records }),
  selectBuilding: (building) => set({ selectedBuilding: building }),
  enterInterior: (buildingId) =>
    set((state) => ({
      worldView: "interior",
      interiorBuildingId: buildingId,
      selectedBuilding: null,
      cameraTransition: 1,
      interiorViewEpoch: state.interiorViewEpoch + 1,
      buildMode: "play",
      buildTool: "place",
      buildCatalogId: null,
      selectedFurnitureId: null,
      hoveredFurnitureId: null,
      buildDirty: false,
      buildSnapshot: null,
      selectedAgentId: null,
      inspectorExpanded: false,
      interiorCameraMode: "iso",
      interiorWalkFocusZone: null,
    })),
  exitInterior: () =>
    set({
      worldView: "campus",
      interiorBuildingId: null,
      cameraTransition: 1,
      interiorCameraMode: "iso",
      interiorWalkFocusZone: null,
      buildMode: "play",
      buildTool: "place",
      buildCatalogId: null,
      selectedFurnitureId: null,
      hoveredFurnitureId: null,
      buildDirty: false,
      buildSnapshot: null,
      selectedAgentId: null,
    }),
  selectAgent: (agentId) => set({ selectedAgentId: agentId }),
  setHoveredDoorBuildingId: (buildingId) => set({ hoveredDoorBuildingId: buildingId }),
  setBuildMode: (buildMode) =>
    set((state) => ({
      buildMode,
      interiorCameraMode: buildMode === "build" ? "iso" : state.interiorCameraMode,
      selectedAgentId: buildMode === "build" ? null : state.selectedAgentId,
      buildCatalogId: buildMode === "play" ? null : state.buildCatalogId,
      selectedFurnitureId: buildMode === "play" ? null : state.selectedFurnitureId,
      hoveredFurnitureId: buildMode === "play" ? null : state.hoveredFurnitureId,
    })),
  setBuildTool: (buildTool) =>
    set((state) => ({
      buildTool,
      buildCatalogId: buildTool === "place" ? state.buildCatalogId : null,
      selectedFurnitureId: buildTool === "place" ? null : state.selectedFurnitureId,
    })),
  setBuildCatalogId: (buildCatalogId) =>
    set({
      buildCatalogId,
      buildTool: "place",
      selectedFurnitureId: null,
    }),
  setSelectedFurnitureId: (selectedFurnitureId) => set({ selectedFurnitureId }),
  setHoveredFurnitureId: (hoveredFurnitureId) => set({ hoveredFurnitureId }),
  setBuildDirty: (buildDirty) => set({ buildDirty }),
  toggleBuildMode: () =>
    set((state) => {
      if (state.buildMode === "build") {
        return {
          buildMode: "play",
          buildTool: "place",
          buildCatalogId: null,
          selectedFurnitureId: null,
          hoveredFurnitureId: null,
          buildSnapshot: null,
          interiorCameraMode: "iso",
        };
      }
      const buildingId = state.interiorBuildingId;
      const snapshot =
        buildingId && state.visualDesign.offices[buildingId]
          ? structuredClone(state.visualDesign.offices[buildingId])
          : null;
      return {
        buildMode: "build",
        buildTool: "place",
        buildCatalogId: state.recentBuildCatalogIds[0] ?? "desk_open",
        selectedAgentId: null,
        buildDirty: false,
        buildSnapshot: snapshot,
      };
    }),
  setInspectorExpanded: (inspectorExpanded) => set({ inspectorExpanded }),
  addRecentBuildCatalog: (catalogId) =>
    set((state) => ({
      recentBuildCatalogIds: [
        catalogId,
        ...state.recentBuildCatalogIds.filter((id) => id !== catalogId),
      ].slice(0, 8),
    })),
  setCameraTransition: (value) => set({ cameraTransition: value }),
  nudgeInteriorZoom: (delta) =>
    set((state) => ({ interiorZoomNudge: state.interiorZoomNudge + delta })),
  clearInteriorZoomNudge: () => set({ interiorZoomNudge: 0 }),
  setInteriorCameraMode: (interiorCameraMode) =>
    set({ interiorCameraMode, cameraTransition: 0, interiorWalkFocusZone: null }),
  requestInteriorWalkZone: (interiorWalkFocusZone) =>
    set({ interiorWalkFocusZone, cameraTransition: 0 }),
  clearInteriorWalkFocusZone: () => set({ interiorWalkFocusZone: null }),
  setInteriorWalkZone: (interiorWalkZone) => set({ interiorWalkZone }),
  requestInteriorScreenshot: () =>
    set((state) => ({ interiorScreenshotEpoch: state.interiorScreenshotEpoch + 1 })),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setIsPaused: (paused) => set({ isPaused: paused }),
  setSimulation: (simulation) =>
    set((state) => ({
      simulation: { ...state.simulation, ...simulation },
    })),
  setFinance: (finance) => set({ finance }),
  setSettings: (settings) => set({ settings }),
  setEvents: (events) => set({ events }),
  prependEvent: (event) =>
    set((state) => ({ events: [event, ...state.events].slice(0, 8) })),
  setActivePanel: (panel) =>
    set((state) => {
      const resolvedPanel = normalizePanelForEdition(panel);
      const exitInterior =
        state.worldView === "interior" &&
        (resolvedPanel === "design_studio" ||
          resolvedPanel === "settings" ||
          resolvedPanel === "god_mode" ||
          resolvedPanel === "achievements" ||
          resolvedPanel === "departments" ||
          resolvedPanel === "agents" ||
          resolvedPanel === "recruitment" ||
          resolvedPanel === "marketplace" ||
          resolvedPanel === "finance" ||
          resolvedPanel === "meeting" ||
          resolvedPanel === "workspace")
          ? {
              worldView: "campus" as const,
              interiorBuildingId: null,
              cameraTransition: 1,
              selectedAgentId: null,
              selectedFurnitureId: null,
              hoveredFurnitureId: null,
            }
          : {};

      if (resolvedPanel === "design_studio") {
        return {
          activePanel: resolvedPanel,
          inspectorExpanded: false,
          ...exitInterior,
        };
      }

      if (
        resolvedPanel === "settings" ||
        resolvedPanel === "god_mode" ||
        resolvedPanel === "achievements" ||
        resolvedPanel === "departments" ||
        resolvedPanel === "agents" ||
        resolvedPanel === "recruitment" ||
        resolvedPanel === "marketplace" ||
        resolvedPanel === "finance" ||
        resolvedPanel === "meeting" ||
        resolvedPanel === "workspace"
      ) {
        return {
          activePanel: resolvedPanel,
          inspectorExpanded: false,
          ...exitInterior,
        };
      }

      return { activePanel: resolvedPanel, ...exitInterior };
    }),
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
  bumpCompanyRevision: () =>
    set((state) => ({ companyRevision: state.companyRevision + 1 })),
  bumpScrumRevision: () =>
    set((state) => ({ scrumRevision: state.scrumRevision + 1 })),
  setShowCreateCompany: (showCreateCompany) => set({ showCreateCompany }),
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
  setOnboardingReady: (ready) => set({ onboardingReady: ready }),
  setVisualDesign: (visualDesign) => set({ visualDesign }),
}));