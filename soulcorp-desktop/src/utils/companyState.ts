import { useGameStore } from "../stores/gameStore";
import type { CompanySummary, TokenEconomy } from "../types/game";

export const EMPTY_FINANCE: TokenEconomy = {
  company_balance: 0,
  monthly_burn_tokens: 0,
  monthly_inflow_tokens: 0,
  allocations: {
    compute_pct: 40,
    salaries_pct: 35,
    marketing_pct: 15,
    rnd_pct: 10,
  },
  departments: {},
  agents: {},
  company_starved: false,
};

export function totalCompanyTokens(economy: TokenEconomy): number {
  let total = economy.company_balance;
  for (const wallet of Object.values(economy.departments)) {
    total += wallet.balance;
  }
  for (const wallet of Object.values(economy.agents)) {
    total += wallet.balance;
  }
  return total;
}

export function hasActiveCompany(
  activeCompanyId: string | null,
  companies: CompanySummary[],
): boolean {
  return Boolean(
    activeCompanyId && companies.some((company) => company.id === activeCompanyId),
  );
}

export function clearEmptyGameState(): void {
  const {
    setAgents,
    setAgentRecords,
    setBuildings,
    setEvents,
    setFinance,
    setSimulation,
    setCompanyName,
    setCompanyIndustry,
    setCompanyTagline,
    setActiveCompanyId,
    selectBuilding,
    setActiveMeeting,
    setAchievements,
    setEndings,
  } = useGameStore.getState();

  setAgents([]);
  setAgentRecords([]);
  setBuildings([]);
  setEvents([]);
  setFinance(EMPTY_FINANCE);
  setSimulation({ tick: 0, agentsActive: 0, dayNumber: 0 });
  setCompanyName("");
  setCompanyIndustry("");
  setCompanyTagline("");
  setActiveCompanyId(null);
  selectBuilding(null);
  setActiveMeeting(null);
  setAchievements([]);
  setEndings([]);
}