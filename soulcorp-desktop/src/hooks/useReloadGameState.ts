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
import { clearEmptyGameState, hasActiveCompany } from "../utils/companyState";
import {
  applyAgentsVisualDesign,
  applyBuildingsVisualDesign,
} from "../utils/applyVisualDesign";
import {
  clearLocalProgress,
  reportLocalProgress,
} from "../stores/progressStore";
import type {
  AchievementSnapshot,
  AgentRecord,
  CompanyDepartmentsSnapshot,
  CustomDepartmentBuilding,
  TokenEconomy,
  TokenEconomySnapshot,
  GameEvent,
  GameSettings,
  HubStatus,
  MeetingSnapshot,
  TierBenefits,
} from "../types/game";
import type { Building } from "../types/world";
import type { WorkspaceTree } from "../types/workspace";

const BOOTSTRAP_OP = "bootstrap";

function toWorldBuilding(building: CustomDepartmentBuilding): Building {
  return {
    id: building.id,
    name: building.name,
    department: building.department,
    position: building.position,
    size: building.size,
    color: building.color,
    roofColor: building.roof_color,
    accentColor: building.accent_color,
    description: building.description,
  };
}

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
        : "Create a company to start your simulation.",
    );
    useWorkspaceStore.getState().reset();
    clearLocalProgress(operationId);
    return;
  }

  reportLocalProgress(operationId, "Syncing hub status…", 60, "hub");

  setCompanyName(onboarding.company_name);
  setCompanyIndustry(onboarding.company_industry);
  setCompanyTagline(onboarding.company_tagline);

  reportLocalProgress(operationId, "Loading visual design…", 75, "visual");
  const visualDesign = await getVisualDesign().catch(() => store.visualDesign);
  setVisualDesign(visualDesign);
  setAgentRecords(agents);
  const baseAgents = syncAgentsFromRecords(agents, []);
  setAgents(applyAgentsVisualDesign(baseAgents, visualDesign));
  setFinance(finance);

  const tierBenefits = await invoke<TierBenefits>("get_tier_benefits").catch(
    (): TierBenefits => ({
      tier: "free",
      platform_fee_percent: 10,
      max_agents: 50,
      cloud_sync_enabled: false,
      priority_gig_matching: false,
      event_foresight_days: 0,
      white_label_export: false,
      executive_lounge: false,
      custom_departments: false,
      ai_co_ceo: false,
    }),
  );
  setTierBenefits(tierBenefits);

  let buildings = INITIAL_BUILDINGS;
  if (tierBenefits.custom_departments) {
    const deptSnapshot = await invoke<CompanyDepartmentsSnapshot>("list_company_departments").catch(
      () => null,
    );
    if (deptSnapshot) {
      const baseIds = new Set(INITIAL_BUILDINGS.map((building) => building.id));
      buildings = [
        ...INITIAL_BUILDINGS.filter((building) => baseIds.has(building.id)),
        ...deptSnapshot.buildings.map(toWorldBuilding),
      ];
    }
  }
  setBuildings(applyBuildingsVisualDesign(buildings, visualDesign));

  if (onboarding.completed && companyReady) {
    const mergedAgents = applyAgentsVisualDesign(
      syncAgentsFromRecords(agents, useGameStore.getState().agents),
      visualDesign,
    );
    setAgents(mergedAgents);
    syncAgentRuntime(mergedAgents);
    useGameStore.getState().setIsPaused(false);
    setStatusMessage("Company loaded. Office simulation ready.");

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
    reportLocalProgress(operationId, "Ready", 100, "done");
    clearLocalProgress(operationId);
  } else {
    setStatusMessage("Complete company setup to start your simulation.");
    clearLocalProgress(operationId);
  }
}