import { invoke } from "@tauri-apps/api/core";
import { getHubStatus } from "../services/hubClient";
import { getOnboardingState } from "../services/onboardingClient";
import { listCompanies } from "../services/companyClient";
import { useGameStore } from "../stores/gameStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { syncAgentsFromRecords } from "../utils/agentBehavior";
import { syncAgentRuntime } from "../utils/agentRuntime";
import { INITIAL_BUILDINGS } from "../data/initialWorld";
import { getVisualDesign } from "../services/visualDesignClient";
import { IS_V2, simulationAutoRun } from "../config/features";
import { normalizePanelForEdition } from "../config/navigation";
import { clearEmptyGameState, hasActiveCompany } from "../utils/companyState";
import {
  applyAgentsVisualDesign,
  applyBuildingsVisualDesign,
} from "../utils/applyVisualDesign";
import { normalizeVisualDesignOffices } from "../utils/officeVisualNormalize";
import {
  clearLocalProgress,
  reportLocalProgress,
} from "../stores/progressStore";
import type {
  AchievementSnapshot,
  AgentRecord,
  TokenEconomy,
  TokenEconomySnapshot,
  GameEvent,
  GameSettings,
  HubStatus,
  MeetingSnapshot,
  TierBenefits,
} from "../types/game";
import type { WorkspaceTree } from "../types/workspace";

const BOOTSTRAP_OP = "bootstrap";

export async function reloadGameState(
  operationId = BOOTSTRAP_OP,
): Promise<void> {
  const store = useGameStore.getState();
  const {
    setAgentRecords,
    setAgents,
    setFinance,
    setSettings,
    setSimulation,
    setHubStatus,
    setTierBenefits,
    setBuildings,
    setCompanyName,
    setCompanyIndustry,
    setCompanyTagline,
    setOnboardingCompleted,
    setCompanies,
    setActiveCompanyId,
    setStatusMessage,
    setVisualDesign,
    selectBuilding,
    setEvents,
    setActiveMeeting,
    setAchievements,
    setEndings,
  } = store;

  selectBuilding(null);
  useGameStore.setState({
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
    cameraTransition: 1,
  });
  setActiveMeeting(null);

  reportLocalProgress(operationId, "Loading company list…", 10, "companies");

  const companyList = await listCompanies();
  reportLocalProgress(operationId, "Loading agents…", 30, "agents");

  const [agents, finance, settings, onboarding, hubStatus] = await Promise.all([
    invoke<AgentRecord[]>("list_agents"),
    invoke<TokenEconomySnapshot>("get_token_economy")
      .then((snapshot) => snapshot.economy)
      .catch(() => invoke<TokenEconomy>("get_finance_state")),
    invoke<GameSettings>("get_game_settings"),
    getOnboardingState(),
    getHubStatus().catch(
      (): HubStatus => ({
        connected: false,
        base_url: "https://soulmd-hub.ysk.hk",
        user_tier: "free",
        soul_balance: 0,
        soul_staked: 0,
        near_wallet_address: null,
        pure_local_mode: false,
        pending_queue_items: 0,
        last_sync_at: null,
      }),
    ),
  ]);

  reportLocalProgress(operationId, "Loading finance & settings…", 45, "finance");

  setCompanies(companyList.companies);
  setActiveCompanyId(companyList.active_company_id);
  setSettings(settings);
  setOnboardingCompleted(onboarding.completed);
  setHubStatus(hubStatus);

  const companyReady = hasActiveCompany(
    companyList.active_company_id,
    companyList.companies,
  );

  if (!companyReady) {
    clearEmptyGameState();
    setOnboardingCompleted(
      onboarding.completed && companyList.companies.length > 0,
    );
    setStatusMessage(
      companyList.companies.length > 0
        ? "Select a company from the header to continue."
        : "Create a company to start your workspace.",
    );
    useWorkspaceStore.getState().reset();
    clearLocalProgress(operationId);
    useGameStore.getState().bumpCompanyRevision();
    return;
  }

  reportLocalProgress(operationId, "Syncing hub status…", 60, "hub");

  const activeCompany = companyList.companies.find(
    (company) => company.id === companyList.active_company_id,
  );
  if (activeCompany) {
    setCompanyName(activeCompany.name);
    setCompanyIndustry(activeCompany.industry);
    setCompanyTagline(activeCompany.tagline);
  } else {
    setCompanyName(onboarding.company_name);
    setCompanyIndustry(onboarding.company_industry);
    setCompanyTagline(onboarding.company_tagline);
  }

  reportLocalProgress(operationId, "Loading visual design…", 75, "visual");
  const visualDesignRaw = await getVisualDesign().catch(() => store.visualDesign);
  const visualDesign = {
    ...visualDesignRaw,
    offices: normalizeVisualDesignOffices(visualDesignRaw.offices),
  };
  setVisualDesign(visualDesign);
  setAgentRecords(agents);
  const baseAgents = syncAgentsFromRecords(agents, []);
  setAgents(applyAgentsVisualDesign(baseAgents, visualDesign));
  setFinance(finance);

  const tierBenefits = await invoke<TierBenefits>("get_tier_benefits").catch(
    (): TierBenefits => ({
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
    }),
  );
  setTierBenefits(tierBenefits);

  let buildings = INITIAL_BUILDINGS;
  const deptSnapshot = await invoke<import("../types/game").DepartmentsSnapshot>("list_departments").catch(
    () => null,
  );
  if (deptSnapshot?.buildings.length) {
    buildings = deptSnapshot.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      department: building.department,
      position: building.position,
      size: building.size,
      color: building.color,
      roofColor: building.roof_color,
      accentColor: building.accent_color,
      description: building.description,
    }));
  }
  setBuildings(applyBuildingsVisualDesign(buildings, visualDesign));

  if (onboarding.completed && companyReady) {
    const mergedAgents = applyAgentsVisualDesign(
      syncAgentsFromRecords(agents, useGameStore.getState().agents),
      visualDesign,
    );
    setAgents(mergedAgents);
    syncAgentRuntime(mergedAgents);
    useGameStore.getState().setIsPaused(!simulationAutoRun);
    setStatusMessage(
      simulationAutoRun
        ? "Company loaded. Office simulation ready."
        : "Company loaded. Projects and workspace ready.",
    );

    reportLocalProgress(operationId, "Loading workspace…", 90, "workspace");
    try {
      const [simSnapshot, events, achievements, activeMeeting] = await Promise.all([
        invoke<{
          tick: number;
          day_number: number;
          agents_active: number;
        }>("get_simulation_snapshot"),
        invoke<GameEvent[]>("get_recent_events"),
        invoke<AchievementSnapshot>("get_achievements"),
        invoke<MeetingSnapshot | null>("get_active_meeting"),
      ]);
      setSimulation({
        tick: simSnapshot.tick,
        dayNumber: simSnapshot.day_number,
        agentsActive: simSnapshot.agents_active,
      });
      setEvents(events);
      setAchievements(achievements.achievements);
      setEndings(achievements.endings);
      setActiveMeeting(activeMeeting);
    } catch (error) {
      setStatusMessage(`Could not load simulation state: ${String(error)}`);
    }

    try {
      const tree = await invoke<WorkspaceTree>("list_workspace_tree");
      await useWorkspaceStore.getState().reloadForCompany(tree);
    } catch (error) {
      useWorkspaceStore.getState().reset();
      setStatusMessage(`Workspace load failed: ${String(error)}`);
    }
    const normalizedPanel = normalizePanelForEdition(useGameStore.getState().activePanel);
    if (normalizedPanel !== useGameStore.getState().activePanel) {
      useGameStore.setState({ activePanel: normalizedPanel });
    }

    reportLocalProgress(operationId, "Ready", 100, "done");
    clearLocalProgress(operationId);
    useGameStore.getState().bumpCompanyRevision();
  } else {
    setStatusMessage(
      IS_V2
        ? "Complete company setup to start your simulation."
        : "Complete company setup to start your workspace.",
    );
    clearLocalProgress(operationId);
    useGameStore.getState().bumpCompanyRevision();
  }
}