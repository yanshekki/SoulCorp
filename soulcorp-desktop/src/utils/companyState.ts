import { useGameStore } from "../stores/gameStore";
import type { CompanySummary, FinanceState } from "../types/game";

export const EMPTY_FINANCE: FinanceState = {
  cash_balance: 0,
  compute_tokens: 0,
  monthly_burn: 0,
  monthly_revenue: 0,
  allocations: {
    compute_pct: 40,
    salaries_pct: 35,
    marketing_pct: 15,
    rnd_pct: 10,
  },
  compute_starved: false,
  cash_crisis: false,
};

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