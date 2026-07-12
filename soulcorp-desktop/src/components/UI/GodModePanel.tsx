import { invoke } from "../../utils/tauriInvoke";
import { useEffect, useMemo, useState } from "react";
import { useCompanyScope } from "../../hooks/useCompanyScope";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import type { GodModeActionResult, GodModeLogEntry, TokenEconomy } from "../../types/game";
import { GOD_MODE_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, prefilterItems, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "./PaginationBar";
import { SearchableListToolbar } from "./SearchableListToolbar";
import { useI18n } from "../../i18n/I18nProvider";

const GOD_MODE_LOG_PAGE_SIZE = 20;

export type GodModeCategory = "simulation" | "economy" | "agents" | "chaos";

export const GOD_MODE_CATEGORIES: { id: GodModeCategory; labelKey: string }[] = [
  { id: "simulation", labelKey: "godMode.cat.simulation" },
  { id: "economy", labelKey: "godMode.cat.economy" },
  { id: "agents", labelKey: "godMode.cat.agents" },
  { id: "chaos", labelKey: "godMode.cat.chaos" },
];

type GodModeAction = {
  id: string;
  command: string;
  labelKey: string;
  previewKey: string;
  riskKey: string;
  category: GodModeCategory;
  args?: Record<string, unknown>;
};

export const GOD_MODE_ACTIONS: GodModeAction[] = [
  {
    id: "timeWarp",
    command: "god_mode_time_warp",
    labelKey: "godMode.action.timeWarp",
    previewKey: "godMode.action.timeWarp.preview",
    riskKey: "godMode.action.timeWarp.risk",
    category: "simulation",
    args: { days: 7 },
  },
  {
    id: "massMotivation",
    command: "god_mode_mass_motivation",
    labelKey: "godMode.action.massMotivation",
    previewKey: "godMode.action.massMotivation.preview",
    riskKey: "godMode.action.massMotivation.risk",
    category: "agents",
  },
  {
    id: "emergencyBudget",
    command: "god_mode_emergency_budget",
    labelKey: "godMode.action.emergencyBudget",
    previewKey: "godMode.action.emergencyBudget.preview",
    riskKey: "godMode.action.emergencyBudget.risk",
    category: "economy",
    args: { amount: 2500 },
  },
  {
    id: "divineInspiration",
    command: "god_mode_divine_inspiration",
    labelKey: "godMode.action.divineInspiration",
    previewKey: "godMode.action.divineInspiration.preview",
    riskKey: "godMode.action.divineInspiration.risk",
    category: "agents",
  },
  {
    id: "blackSwan",
    command: "god_mode_black_swan",
    labelKey: "godMode.action.blackSwan",
    previewKey: "godMode.action.blackSwan.preview",
    riskKey: "godMode.action.blackSwan.risk",
    category: "chaos",
  },
  {
    id: "agentMutation",
    command: "god_mode_agent_mutation",
    labelKey: "godMode.action.agentMutation",
    previewKey: "godMode.action.agentMutation.preview",
    riskKey: "godMode.action.agentMutation.risk",
    category: "agents",
    args: {},
  },
  {
    id: "realityEdit",
    command: "god_mode_reality_edit",
    labelKey: "godMode.action.realityEdit",
    previewKey: "godMode.action.realityEdit.preview",
    riskKey: "godMode.action.realityEdit.risk",
    category: "economy",
    args: {},
  },
  {
    id: "perfectHiring",
    command: "god_mode_perfect_hiring",
    labelKey: "godMode.action.perfectHiring",
    previewKey: "godMode.action.perfectHiring.preview",
    riskKey: "godMode.action.perfectHiring.risk",
    category: "economy",
  },
  {
    id: "totalChaos",
    command: "god_mode_total_chaos",
    labelKey: "godMode.action.totalChaos",
    previewKey: "godMode.action.totalChaos.preview",
    riskKey: "godMode.action.totalChaos.risk",
    category: "chaos",
  },
  {
    id: "resetMemory",
    command: "god_mode_reset_agent_memory",
    labelKey: "godMode.action.resetMemory",
    previewKey: "godMode.action.resetMemory.preview",
    riskKey: "godMode.action.resetMemory.risk",
    category: "agents",
    args: {},
  },
  {
    id: "forceRomance",
    command: "god_mode_force_relationship",
    labelKey: "godMode.action.forceRomance",
    previewKey: "godMode.action.forceRomance.preview",
    riskKey: "godMode.action.forceRomance.risk",
    category: "agents",
    args: { relationshipType: "romance" },
  },
  {
    id: "forceRivalry",
    command: "god_mode_force_relationship",
    labelKey: "godMode.action.forceRivalry",
    previewKey: "godMode.action.forceRivalry.preview",
    riskKey: "godMode.action.forceRivalry.risk",
    category: "agents",
    args: { relationshipType: "rivalry" },
  },
];

interface GodModeDisabledGateProps {
  onEnable: () => void;
  busy?: boolean;
}

export function GodModeDisabledGate({ onEnable, busy }: GodModeDisabledGateProps) {
  const { t } = useI18n();
  return (
    <div className="god-mode-disabled-gate">
      <div className="god-mode-disabled-card">
        <h3>{t("godMode.gateTitle")}</h3>
        <p className="muted">{t("godMode.gateDesc")}</p>
        <ul className="god-mode-disabled-list">
          <li>{t("godMode.gateItem1")}</li>
          <li>{t("godMode.gateItem2")}</li>
          <li>{t("godMode.gateItem3")}</li>
        </ul>
        <button type="button" className="primary-action" onClick={onEnable} disabled={busy}>
          {busy ? t("godMode.enabling") : t("godMode.enable")}
        </button>
      </div>
    </div>
  );
}

function RealityDebtMeter({ realityDebt }: { realityDebt: number }) {
  const { t } = useI18n();
  return (
    <div className="reality-debt-meter" aria-label={t("godMode.realityDebt")}>
      <span>{t("godMode.realityDebtPct", { pct: (realityDebt * 100).toFixed(0) })}</span>
      <div className="reality-debt-bar">
        <span
          className={realityDebt >= 0.35 ? "reality-debt-fill warning" : "reality-debt-fill"}
          style={{ width: `${Math.round(realityDebt * 100)}%` }}
        />
      </div>
      {realityDebt >= 0.35 ? (
        <p className="muted">{t("godMode.highDebt")}</p>
      ) : null}
    </div>
  );
}

export function GodModePanel() {
  const { t } = useI18n();
  const { activeCompanyId, companyRevision } = useCompanyScope();
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setSimulation = useGameStore((state) => state.setSimulation);
  const setFinance = useGameStore((state) => state.setFinance);
  const [history, setHistory] = useState<GodModeLogEntry[]>([]);
  const [selected, setSelected] = useState<string>(GOD_MODE_ACTIONS[0].id);
  const [realityDebt, setRealityDebt] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySearchType, setHistorySearchType] = useState(SEARCH_TYPE_ALL);
  const [historyPage, setHistoryPage] = useState(0);
  const debouncedHistoryQuery = useDebouncedValue(historySearchQuery);

  const refreshHistory = async () => {
    const [entries, status] = await Promise.all([
      invoke<GodModeLogEntry[]>("get_god_mode_history"),
      invoke<{ reality_debt: number }>("get_god_mode_status"),
    ]);
    setHistory(entries);
    setRealityDebt(status.reality_debt);
  };

  useEffect(() => {
    if (!activeCompanyId) {
      setHistory([]);
      setRealityDebt(0);
      return;
    }
    void refreshHistory();
  }, [activeCompanyId, companyRevision]);

  const runAction = async (action: GodModeAction) => {
    setRunning(action.id);
    try {
      const result = await invoke<GodModeActionResult>(action.command, action.args ?? {});
      setSimulation({ dayNumber: result.day_number });
      const finance = await invoke<TokenEconomy>("get_finance_state");
      setFinance(finance);
      setStatusMessage(result.message);
      await refreshHistory();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setRunning(null);
    }
  };

  const actionCategoryByCommand = useMemo(
    () => new Map(GOD_MODE_ACTIONS.map((action) => [action.command, action.category])),
    [],
  );

  const scopedHistory = useMemo(
    () =>
      prefilterItems(history, historySearchType, (entry, type) => {
        if (type === SEARCH_TYPE_ALL) {
          return true;
        }
        return actionCategoryByCommand.get(entry.action) === type;
      }),
    [history, historySearchType, actionCategoryByCommand],
  );

  const filteredHistory = useMemo(
    () =>
      filterByScopedQuery(scopedHistory, debouncedHistoryQuery, historySearchType, {
        all: (entry) => [
          entry.action,
          entry.message,
          String(entry.day_number),
          String(entry.reality_cost),
        ],
        simulation: (entry) => [entry.action, entry.message],
        economy: (entry) => [entry.action, entry.message],
        agents: (entry) => [entry.action, entry.message],
        chaos: (entry) => [entry.action, entry.message],
      }),
    [scopedHistory, debouncedHistoryQuery, historySearchType],
  );

  const {
    pageItems: historyPageItems,
    totalPages: historyTotalPages,
    safePage: historySafePage,
  } = useMemo(
    () => paginateItems(filteredHistory, historyPage, GOD_MODE_LOG_PAGE_SIZE),
    [filteredHistory, historyPage],
  );

  useEffect(() => {
    setHistoryPage(0);
  }, [debouncedHistoryQuery, historySearchType, history.length]);

  const activePreview = GOD_MODE_ACTIONS.find((action) => action.id === selected);

  return (
    <div className="god-mode-panel god-mode-panel--page">
      <div className="god-mode-page-body">
        <div className="god-mode-main">
          {GOD_MODE_CATEGORIES.map((category) => {
            const actions = GOD_MODE_ACTIONS.filter((action) => action.category === category.id);
            if (actions.length === 0) {
              return null;
            }
            return (
              <section key={category.id} className="god-mode-category">
                <h3>{t(category.labelKey)}</h3>
                <div className="god-mode-action-grid">
                  {actions.map((action) => (
                    <article
                      key={action.id}
                      className={`god-mode-action-card${selected === action.id ? " selected" : ""}`}
                      onMouseEnter={() => setSelected(action.id)}
                      onFocus={() => setSelected(action.id)}
                    >
                      <div className="god-mode-action-card-body">
                        <strong>{t(action.labelKey)}</strong>
                        <p className="muted">{t(action.previewKey)}</p>
                      </div>
                      <button
                        type="button"
                        className="god-mode-action-btn"
                        disabled={running !== null}
                        onClick={() => void runAction(action)}
                      >
                        {running === action.id ? t("godMode.running") : t("godMode.execute")}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="god-mode-side-panel">
          <RealityDebtMeter realityDebt={realityDebt} />

          {activePreview ? (
            <div className="god-mode-preview">
              <strong>{t(activePreview.labelKey)}</strong>
              <p>{t(activePreview.previewKey)}</p>
              <p className="muted">{t("godMode.risk", { risk: t(activePreview.riskKey) })}</p>
              <button
                type="button"
                className="primary-action"
                disabled={running !== null}
                onClick={() => void runAction(activePreview)}
              >
                {running === activePreview.id
                  ? t("godMode.running")
                  : t("godMode.executeNamed", { name: t(activePreview.labelKey) })}
              </button>
            </div>
          ) : null}

          <div className="god-mode-history">
            <h3>{t("godMode.interventionLog")}</h3>
            {history.length > 0 ? (
              <>
                <SearchableListToolbar
                  query={historySearchQuery}
                  onQueryChange={setHistorySearchQuery}
                  placeholder={t("godMode.searchPlaceholder")}
                  ariaLabel={t("godMode.searchAria")}
                  matchCount={
                    debouncedHistoryQuery.trim() || historySearchType !== SEARCH_TYPE_ALL
                      ? filteredHistory.length
                      : undefined
                  }
                  totalCount={scopedHistory.length}
                  typeFilter={{
                    value: historySearchType,
                    onChange: setHistorySearchType,
                    options: GOD_MODE_SEARCH_TYPES,
                    ariaLabel: t("godMode.filterTypeAria"),
                    label: t("godMode.filterType"),
                  }}
                />
                {debouncedHistoryQuery.trim() && filteredHistory.length === 0 ? (
                  <p className="search-empty-hint muted">
                    {t("godMode.noMatches", { query: debouncedHistoryQuery })}
                  </p>
                ) : null}
                <ul>
                  {historyPageItems.map((entry) => (
                    <li key={entry.id}>
                      <strong>{t("godMode.logDay", { day: entry.day_number })}</strong> ·{" "}
                      {entry.action.replace(/_/g, " ")}
                      <span className="muted"> — {entry.message}</span>
                      <span className="muted">
                        {t("godMode.realityCost", {
                          pct: (entry.reality_cost * 100).toFixed(0),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
                <PaginationBar
                  page={historySafePage}
                  totalPages={historyTotalPages}
                  label={t("godMode.pagination")}
                  onPageChange={setHistoryPage}
                />
              </>
            ) : (
              <p className="muted">{t("godMode.noInterventions")}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}