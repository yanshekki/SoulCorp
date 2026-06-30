import { invoke } from "@tauri-apps/api/core";
import { getHubStatus } from "../services/hubClient";
import { getOnboardingState } from "../services/onboardingClient";
import { listCompanies } from "../services/companyClient";
import { useGameStore } from "../stores/gameStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { syncAgentsFromRecords } from "../utils/agentBehavior";
import { INITIAL_BUILDINGS } from "../data/initialWorld";
import type {
  AgentRecord,
  CompanyDepartmentsSnapshot,
  CustomDepartmentBuilding,
  FinanceState,
  GameSettings,
  HubStatus,
  TierBenefits,
} from "../types/game";
import type { Building } from "../types/world";
import type { WorkspaceTree } from "../types/workspace";

const SAMPLE_SOULS = [
  { agentId: "agent-1", path: "/samples/mira.soul.md" },
  { agentId: "agent-2", path: "/samples/kai.soul.md" },
  { agentId: "agent-3", path: "/samples/ren.soul.md" },
];

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

export async function reloadGameState(): Promise<void> {
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
  } = store;

  const [agents, finance, settings, onboarding, hubStatus, companyList] = await Promise.all([
    invoke<AgentRecord[]>("list_agents"),
    invoke<FinanceState>("get_finance_state"),
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
    listCompanies(),
  ]);

  setCompanies(companyList.companies);
  setActiveCompanyId(companyList.active_company_id);
  setAgentRecords(agents);
  setAgents(syncAgentsFromRecords(agents, []));
  setFinance(finance);
  setSettings(settings);
  setCompanyName(onboarding.company_name);
  setCompanyIndustry(onboarding.company_industry);
  setCompanyTagline(onboarding.company_tagline);
  setOnboardingCompleted(onboarding.completed);
  setHubStatus(hubStatus);

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

  if (tierBenefits.custom_departments) {
    const deptSnapshot = await invoke<CompanyDepartmentsSnapshot>("list_company_departments").catch(
      () => null,
    );
    if (deptSnapshot) {
      const baseIds = new Set(INITIAL_BUILDINGS.map((building) => building.id));
      setBuildings([
        ...INITIAL_BUILDINGS.filter((building) => baseIds.has(building.id)),
        ...deptSnapshot.buildings.map(toWorldBuilding),
      ]);
    }
  } else {
    setBuildings(INITIAL_BUILDINGS);
  }

  if (onboarding.completed) {
    await Promise.all(
      SAMPLE_SOULS.map(async ({ agentId, path }) => {
        const response = await fetch(path);
        const soul_md_content = await response.text();
        await invoke("load_agent_soul", {
          request: {
            agent_id: agentId,
            soul_md_path: null,
            soul_md_content,
          },
        });
      }),
    );

    const refreshedAgents = await invoke<AgentRecord[]>("list_agents");
    setAgentRecords(refreshedAgents);
    setAgents(syncAgentsFromRecords(refreshedAgents, useGameStore.getState().agents));
    setSimulation({ dayNumber: 1 });
    setStatusMessage("Company loaded. Office simulation ready.");

    try {
      const tree = await invoke<WorkspaceTree>("list_workspace_tree");
      useWorkspaceStore.getState().setTree(tree);
    } catch {
      useWorkspaceStore.getState().reset();
    }
  } else {
    setStatusMessage("Complete company setup to start your simulation.");
  }
}