import { invoke } from "../../utils/tauriInvoke";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { totalCompanyTokens } from "../../utils/companyState";
import type {
  AgentRecord,
  BudgetAllocations,
  TokenBudgetPeriodType,
  TokenEconomy,
  TokenEconomySnapshot,
  TokenUsageEntry,
} from "../../types/game";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { showAgentMorale } from "../../config/features";
import { AgentTokenBudgetEditor } from "./AgentTokenBudgetEditor";
import { agentLabelById } from "../../utils/agentLabel";
import { LEDGER_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { paginateItems } from "../../utils/pagination";
import { useI18n } from "../../i18n/I18nProvider";
import { PaginationBar } from "./PaginationBar";
import { SearchableListToolbar } from "./SearchableListToolbar";

const LEDGER_PAGE_SIZE = 25;

export const TOKENS_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "allocation", label: "Budget split" },
  { id: "departments", label: "Departments" },
  { id: "agents", label: "Agents" },
  { id: "ledger", label: "Usage ledger" },
  { id: "salaries", label: "Salaries" },
] as const;

function formatTokens(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

interface FinancePanelProps {
  activeSection: string;
  onNavigateSection?: (sectionId: string) => void;
}

export function FinancePanel({ activeSection, onNavigateSection }: FinancePanelProps) {
  const { t } = useI18n();
  const finance = useGameStore((state) => state.finance);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setFinance = useGameStore((state) => state.setFinance);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [ledger, setLedger] = useState<TokenUsageEntry[]>([]);
  const [savingBudgetKey, setSavingBudgetKey] = useState<string | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, number>>({});
  const [deptAllocDrafts, setDeptAllocDrafts] = useState<Record<string, number>>({});
  const [agentAllocDrafts, setAgentAllocDrafts] = useState<Record<string, number>>({});
  const [rebalancing, setRebalancing] = useState(false);
  /** Per-card feedback so Allocate/Save never feels silent. */
  const [walletFlash, setWalletFlash] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [allocatingKey, setAllocatingKey] = useState<string | null>(null);
  const [companyPoolDraft, setCompanyPoolDraft] = useState<number>(0);
  const [companyPoolBusy, setCompanyPoolBusy] = useState(false);
  const [companyPoolFlash, setCompanyPoolFlash] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const flashWallet = (key: string, ok: boolean, message: string) => {
    setWalletFlash((current) => ({ ...current, [key]: { ok, message } }));
    window.setTimeout(() => {
      setWalletFlash((current) => {
        if (current[key]?.message !== message) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    }, 5000);
  };
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState("");
  const [ledgerSearchType, setLedgerSearchType] = useState(SEARCH_TYPE_ALL);
  const [ledgerPage, setLedgerPage] = useState(0);
  const debouncedLedgerQuery = useDebouncedValue(ledgerSearchQuery);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const net = finance.monthly_inflow_tokens - finance.monthly_burn_tokens;
  const displayTotal = totalTokens > 0 ? totalTokens : totalCompanyTokens(finance);

  const agentNameById = useMemo(() => agentLabelById(agentRecords), [agentRecords]);

  const departmentRows = useMemo(
    () =>
      Object.entries(finance.departments).sort(([left], [right]) => left.localeCompare(right)),
    [finance.departments],
  );

  const filteredLedger = useMemo(
    () =>
      filterByScopedQuery(ledger, debouncedLedgerQuery, ledgerSearchType, {
        all: (entry) => {
          const agentName = entry.agent_id
            ? (agentNameById.get(entry.agent_id) ?? entry.agent_id)
            : "";
          return [
            entry.source,
            entry.provider ?? "",
            entry.department,
            agentName,
            entry.agent_id ?? "",
            new Date(entry.at).toLocaleString(),
            String(entry.total_tokens),
          ];
        },
        source: (entry) => [entry.source, entry.provider ?? ""],
        department: (entry) => [entry.department],
        agent: (entry) => {
          const agentName = entry.agent_id
            ? (agentNameById.get(entry.agent_id) ?? entry.agent_id)
            : "";
          return [agentName, entry.agent_id ?? ""];
        },
      }),
    [ledger, debouncedLedgerQuery, ledgerSearchType, agentNameById],
  );

  const {
    pageItems: ledgerPageItems,
    totalPages: ledgerTotalPages,
    safePage: ledgerSafePage,
  } = useMemo(
    () => paginateItems(filteredLedger, ledgerPage, LEDGER_PAGE_SIZE),
    [filteredLedger, ledgerPage],
  );

  useEffect(() => {
    setLedgerPage(0);
  }, [debouncedLedgerQuery, ledgerSearchType, ledger.length]);

  const agentWalletRows = useMemo(
    () =>
      Object.entries(finance.agents)
        .map(([agentId, wallet]) => ({
          agentId,
          name: agentNameById.get(agentId) ?? agentId,
          wallet,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [finance.agents, agentNameById],
  );

  const deptBudgetCount = departmentRows.filter(([, wallet]) => (wallet.period_limit ?? 0) > 0).length;
  const agentBudgetCount = agentWalletRows.filter(({ wallet }) => (wallet.period_limit ?? 0) > 0).length;

  const refreshSnapshot = useCallback(async () => {
    try {
      const snapshot = await invoke<TokenEconomySnapshot>("get_token_economy");
      setFinance(snapshot.economy);
      setLedger(snapshot.ledger);
      setTotalTokens(snapshot.total_tokens);
    } catch {
      const economy = await invoke<TokenEconomy>("get_finance_state");
      setFinance(economy);
      setTotalTokens(totalCompanyTokens(economy));
      const entries = await invoke<TokenUsageEntry[]>("get_token_usage_ledger", {
        department: null,
        agentId: null,
      });
      setLedger(entries);
    }
  }, [setFinance]);

  useEffect(() => {
    setSalaryDrafts(
      Object.fromEntries(agentRecords.map((agent) => [agent.id, Math.round(agent.salary)])),
    );
  }, [agentRecords]);

  useEffect(() => {
    void refreshSnapshot();
  }, [activeCompanyId, refreshSnapshot]);

  useEffect(() => {
    setCompanyPoolDraft(Math.max(0, Math.floor(finance.company_balance ?? 0)));
  }, [finance.company_balance]);

  const updateAllocation = async (key: keyof BudgetAllocations, value: number) => {
    try {
      const updated = await invoke<TokenEconomy>("update_budget_allocations", {
        update: { [key]: value },
      });
      setFinance(updated);
      setStatusMessage(t("status.budgetUpdated"));
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const commitSalary = async (agentId: string) => {
    const salary = salaryDrafts[agentId];
    if (!Number.isFinite(salary) || salary <= 0) {
      return;
    }
    const current = agentRecords.find((agent) => agent.id === agentId);
    if (current && Math.round(current.salary) === Math.round(salary)) {
      return;
    }
    try {
      const updated = await invoke<TokenEconomy>("adjust_agent_salary", {
        update: { agent_id: agentId, salary },
      });
      const refreshedAgents = await invoke<AgentRecord[]>("list_agents");
      setFinance(updated);
      setAgentRecords(refreshedAgents);
      setStatusMessage(t("status.salaryUpdated"));
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const allocateDepartment = async (department: string) => {
    const raw = deptAllocDrafts[department] ?? 0;
    if (!Number.isFinite(raw) || raw < 0) {
      const msg = t("finance.invalidPack");
      flashWallet(`dept:${department}`, false, msg);
      setStatusMessage(msg);
      return;
    }
    const key = `dept:${department}`;
    setAllocatingKey(key);
    try {
      const result = await invoke<{
        economy: TokenEconomy;
        amount_applied: number;
        used_unlimited_pack: boolean;
        message: string;
      }>("allocate_department_tokens_cmd", {
        request: { department, amount: Math.floor(raw) },
      });
      setFinance(result.economy);
      setDeptAllocDrafts((current) => ({ ...current, [department]: 0 }));
      flashWallet(key, true, result.message);
      setStatusMessage(result.message);
      await refreshSnapshot();
    } catch (error) {
      const msg = String(error);
      flashWallet(key, false, msg);
      setStatusMessage(msg);
    } finally {
      setAllocatingKey(null);
    }
  };

  const allocateAgent = async (agentId: string) => {
    const raw = agentAllocDrafts[agentId] ?? 0;
    if (!Number.isFinite(raw) || raw < 0) {
      const msg = t("finance.invalidPack");
      flashWallet(`agent:${agentId}`, false, msg);
      setStatusMessage(msg);
      return;
    }
    const key = `agent:${agentId}`;
    setAllocatingKey(key);
    try {
      const result = await invoke<{
        economy: TokenEconomy;
        amount_applied: number;
        used_unlimited_pack: boolean;
        message: string;
      }>("allocate_agent_tokens_cmd", {
        request: { agent_id: agentId, amount: Math.floor(raw) },
      });
      setFinance(result.economy);
      setAgentAllocDrafts((current) => ({ ...current, [agentId]: 0 }));
      flashWallet(key, true, result.message);
      setStatusMessage(result.message);
      await refreshSnapshot();
    } catch (error) {
      const msg = String(error);
      flashWallet(key, false, msg);
      setStatusMessage(msg);
    } finally {
      setAllocatingKey(null);
    }
  };

  const saveDepartmentBudget = async (
    department: string,
    policy: {
      period_limit: number;
      period_type: TokenBudgetPeriodType;
      period_days?: number;
    },
  ) => {
    const key = `dept:${department}`;
    setSavingBudgetKey(key);
    try {
      const updated = await invoke<TokenEconomy>("update_department_token_budget_cmd", {
        request: { department, policy },
      });
      setFinance(updated);
      const msg =
        policy.period_limit === 0
          ? t("finance.periodSavedUnlimited", { name: department })
          : t("finance.periodSaved", {
              name: department,
              amount: formatTokens(policy.period_limit),
            });
      flashWallet(key, true, msg);
      setStatusMessage(msg);
      await refreshSnapshot();
    } catch (error) {
      const msg = String(error);
      flashWallet(key, false, msg);
      setStatusMessage(msg);
    } finally {
      setSavingBudgetKey(null);
    }
  };

  const saveAgentBudget = async (
    agentId: string,
    policy: {
      period_limit: number;
      period_type: TokenBudgetPeriodType;
      period_days?: number;
    },
  ) => {
    const key = `agent:${agentId}`;
    setSavingBudgetKey(key);
    try {
      const updated = await invoke<TokenEconomy>("update_agent_token_budget_cmd", {
        request: { agent_id: agentId, policy },
      });
      setFinance(updated);
      const name = agentNameById.get(agentId) ?? agentId;
      const msg =
        policy.period_limit === 0
          ? t("finance.periodSavedUnlimited", { name })
          : t("finance.periodSaved", {
              name,
              amount: formatTokens(policy.period_limit),
            });
      flashWallet(key, true, msg);
      setStatusMessage(msg);
      await refreshSnapshot();
    } catch (error) {
      const msg = String(error);
      flashWallet(key, false, msg);
      setStatusMessage(msg);
    } finally {
      setSavingBudgetKey(null);
    }
  };

  const rebalanceWallets = async () => {
    setRebalancing(true);
    try {
      const updated = await invoke<TokenEconomy>("rebalance_token_wallets_cmd");
      setFinance(updated);
      setStatusMessage(t("status.walletsRebalanced"));
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setRebalancing(false);
    }
  };

  const applyCompanyPool = async (mode: "set" | "add", amountOverride?: number) => {
    const amount = amountOverride ?? companyPoolDraft;
    if (!Number.isFinite(amount) || amount < 0) {
      const msg = t("finance.invalidPool");
      setCompanyPoolFlash({ ok: false, message: msg });
      setStatusMessage(msg);
      return;
    }
    if (mode === "add" && amount <= 0) {
      const msg = t("finance.topUpPositive");
      setCompanyPoolFlash({ ok: false, message: msg });
      setStatusMessage(msg);
      return;
    }
    setCompanyPoolBusy(true);
    try {
      const result = await invoke<{
        economy: TokenEconomy;
        company_balance: number;
        message: string;
      }>("update_company_pool_cmd", {
        request:
          mode === "set"
            ? { set_to: Math.floor(amount), add: null }
            : { set_to: null, add: Math.floor(amount) },
      });
      setFinance(result.economy);
      setCompanyPoolDraft(result.company_balance);
      setCompanyPoolFlash({ ok: true, message: result.message });
      setStatusMessage(result.message);
      await refreshSnapshot();
    } catch (error) {
      const msg = String(error);
      setCompanyPoolFlash({ ok: false, message: msg });
      setStatusMessage(msg);
    } finally {
      setCompanyPoolBusy(false);
    }
  };

  return (
    <div className="finance-panel finance-panel--page" ref={scrollRootRef}>
      {activeSection === "overview" ? (
      <section
        id="overview"
        className="tokens-card tokens-card--wide"
        data-tokens-section="overview"
      >
        <header className="tokens-card-header tokens-card-header--stacked">
          <h3>{t("finance.overviewTitle")}</h3>
          <p className="muted">{t("finance.overviewDesc")}</p>
        </header>

        {finance.company_starved ? (
          <p className="finance-alert negative hub-warning">{t("finance.starved")}</p>
        ) : null}

        <div className="kpi-grid tokens-stats-grid">
          <article>
            <span>{t("finance.kpi.companyPool")}</span>
            <strong>{formatTokens(finance.company_balance)}</strong>
          </article>
          <article>
            <span>{t("finance.kpi.total")}</span>
            <strong>{formatTokens(displayTotal)}</strong>
          </article>
          <article>
            <span>{t("finance.kpi.monthlyBurn")}</span>
            <strong>{formatTokens(finance.monthly_burn_tokens)}</strong>
          </article>
          <article>
            <span>{t("finance.kpi.monthlyInflow")}</span>
            <strong>{formatTokens(finance.monthly_inflow_tokens)}</strong>
          </article>
          <article>
            <span>{t("finance.kpi.deptCaps")}</span>
            <strong>{deptBudgetCount}</strong>
          </article>
          <article>
            <span>{t("finance.kpi.agentCaps")}</span>
            <strong>{agentBudgetCount}</strong>
          </article>
        </div>

        <p className={`finance-net tokens-net ${net >= 0 ? "positive" : "negative"}`}>
          {t("finance.monthlyNet", {
            sign: net >= 0 ? "+" : "",
            amount: formatTokens(net),
          })}
        </p>

        <div className="tokens-company-pool-editor" aria-label={t("finance.setPoolAria")}>
          <header>
            <h4>{t("finance.companyPoolTitle")}</h4>
            <p className="muted">{t("finance.companyPoolDesc")}</p>
          </header>
          <div className="tokens-company-pool-row">
            <label className="field-label">
              {t("finance.amount")}
              <input
                type="number"
                className="salary-input"
                min={0}
                step={1000}
                value={companyPoolDraft}
                disabled={companyPoolBusy}
                onChange={(e) => setCompanyPoolDraft(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <div className="tokens-company-pool-actions">
              <button
                type="button"
                className="primary-action"
                disabled={companyPoolBusy}
                onClick={() => void applyCompanyPool("set")}
              >
                {companyPoolBusy ? t("finance.saving") : t("finance.setPool")}
              </button>
              <button
                type="button"
                className="secondary-action"
                disabled={companyPoolBusy}
                onClick={() => void applyCompanyPool("add")}
              >
                {t("finance.topUp")}
              </button>
            </div>
          </div>
          <div className="tokens-company-pool-presets" role="group" aria-label={t("finance.quickTopUpAria")}>
            {[10_000, 50_000, 250_000, 1_000_000].map((preset) => (
              <button
                key={preset}
                type="button"
                className="secondary-action"
                disabled={companyPoolBusy}
                onClick={() => void applyCompanyPool("add", preset)}
              >
                +{formatTokens(preset)}
              </button>
            ))}
          </div>
          {companyPoolFlash ? (
            <p
              className={
                companyPoolFlash.ok
                  ? "tokens-wallet-flash tokens-wallet-flash--ok"
                  : "tokens-wallet-flash tokens-wallet-flash--err"
              }
              role="status"
            >
              {companyPoolFlash.message}
            </p>
          ) : null}
        </div>

        <div className="tokens-card-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => void rebalanceWallets()}
            disabled={rebalancing}
          >
            {rebalancing ? t("finance.rebalancing") : t("finance.rebalance")}
          </button>
          <button type="button" className="secondary-action" onClick={() => void refreshSnapshot()}>
            {t("finance.refreshLedger")}
          </button>
          <button type="button" className="secondary-action" onClick={() => onNavigateSection?.("departments")}>
            {t("finance.allocateTokens")}
          </button>
        </div>
      </section>
      ) : null}

      {activeSection === "allocation" ? (
      <section
        id="allocation"
        className="tokens-card tokens-card--wide"
        data-tokens-section="allocation"
      >
        <header className="tokens-card-header tokens-card-header--stacked">
          <h3>{t("finance.budgetTitle")}</h3>
          <p className="muted">{t("finance.budgetDesc")}</p>
        </header>

        <div className="budget-allocation tokens-budget-allocation">
          {(
            [
              ["compute_pct", t("finance.compute")],
              ["salaries_pct", t("finance.salaries")],
              ["marketing_pct", t("finance.marketing")],
              ["rnd_pct", t("finance.rnd")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="budget-slider tokens-budget-slider">
              <span>
                {label} ({finance.allocations[key].toFixed(0)}%)
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={finance.allocations[key]}
                onChange={(event) => void updateAllocation(key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </section>
      ) : null}

      {activeSection === "departments" ? (
      <section
        id="departments"
        className="tokens-card tokens-card--wide"
        data-tokens-section="departments"
      >
        <header className="tokens-card-header">
          <div>
            <h3>{t("finance.deptWallets")}</h3>
            <p className="muted tokens-card-subtitle">
              {t("finance.deptWalletsDesc", { pool: formatTokens(finance.company_balance) })}
            </p>
          </div>
          <span className="tokens-count-pill">{t("finance.deptCount", { n: departmentRows.length })}</span>
        </header>

        {departmentRows.length === 0 ? (
          <p className="muted">{t("finance.noDeptWallets")}</p>
        ) : (
          <div className="tokens-wallet-grid">
            {departmentRows.map(([department, wallet]) => {
              const flashKey = `dept:${department}`;
              const flash = walletFlash[flashKey];
              const busy = allocatingKey === flashKey;
              return (
              <article key={department} className="tokens-wallet-card tokens-wallet-card--budget">
                <header>
                  <strong>{department}</strong>
                  <span className="tokens-wallet-meta">
                    {t("finance.allocated", { amount: formatTokens(wallet.allocated) })}
                  </span>
                </header>
                <div className="tokens-wallet-actions">
                  <input
                    type="number"
                    className="salary-input"
                    min={0}
                    step={1000}
                    title={t("finance.unlimitedTitle")}
                    placeholder={t("finance.unlimitedPh")}
                    value={deptAllocDrafts[department] ?? 0}
                    onChange={(event) =>
                      setDeptAllocDrafts((current) => ({
                        ...current,
                        [department]: Number(event.target.value),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy}
                    onClick={() => void allocateDepartment(department)}
                  >
                    {busy ? t("finance.allocating") : t("finance.allocate")}
                  </button>
                </div>
                <p className="muted tokens-alloc-hint">{t("finance.allocHint")}</p>
                {flash ? (
                  <p
                    className={flash.ok ? "tokens-wallet-flash tokens-wallet-flash--ok" : "tokens-wallet-flash tokens-wallet-flash--err"}
                    role="status"
                  >
                    {flash.message}
                  </p>
                ) : null}
                <AgentTokenBudgetEditor
                  wallet={wallet}
                  saving={savingBudgetKey === flashKey}
                  onSave={(policy) => void saveDepartmentBudget(department, policy)}
                />
              </article>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "agents" ? (
      <section
        id="agents"
        className="tokens-card tokens-card--wide"
        data-tokens-section="agents"
      >
        <header className="tokens-card-header">
          <div>
            <h3>{t("finance.agentWallets")}</h3>
            <p className="muted tokens-card-subtitle">{t("finance.agentWalletsDesc")}</p>
          </div>
          <span className="tokens-count-pill">{t("finance.agentCount", { n: agentWalletRows.length })}</span>
        </header>

        {agentWalletRows.length === 0 ? (
          <p className="muted">{t("finance.noAgentWallets")}</p>
        ) : (
          <div className="tokens-wallet-grid">
            {agentWalletRows.map(({ agentId, name, wallet }) => {
              const flashKey = `agent:${agentId}`;
              const flash = walletFlash[flashKey];
              const busy = allocatingKey === flashKey;
              return (
              <article key={agentId} className="tokens-wallet-card tokens-wallet-card--budget">
                <header>
                  <strong>{name}</strong>
                  <span className="tokens-wallet-meta">
                    {t("finance.allocated", { amount: formatTokens(wallet.allocated) })}
                  </span>
                </header>
                <div className="tokens-wallet-actions">
                  <input
                    type="number"
                    className="salary-input"
                    min={0}
                    step={1000}
                    title={t("finance.unlimitedTitle")}
                    placeholder={t("finance.unlimitedPh")}
                    value={agentAllocDrafts[agentId] ?? 0}
                    onChange={(event) =>
                      setAgentAllocDrafts((current) => ({
                        ...current,
                        [agentId]: Number(event.target.value),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy}
                    onClick={() => void allocateAgent(agentId)}
                  >
                    {busy ? t("finance.allocating") : t("finance.allocate")}
                  </button>
                </div>
                <p className="muted tokens-alloc-hint">{t("finance.allocHint")}</p>
                {flash ? (
                  <p
                    className={flash.ok ? "tokens-wallet-flash tokens-wallet-flash--ok" : "tokens-wallet-flash tokens-wallet-flash--err"}
                    role="status"
                  >
                    {flash.message}
                  </p>
                ) : null}
                <AgentTokenBudgetEditor
                  wallet={wallet}
                  saving={savingBudgetKey === flashKey}
                  onSave={(policy) => void saveAgentBudget(agentId, policy)}
                />
              </article>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {activeSection === "ledger" ? (
      <section
        id="ledger"
        className="tokens-card tokens-card--wide"
        data-tokens-section="ledger"
      >
        <header className="tokens-card-header">
          <div>
            <h3>{t("finance.ledgerTitle")}</h3>
            <p className="muted tokens-card-subtitle">{t("finance.ledgerDesc")}</p>
          </div>
          <span className="tokens-count-pill">
            {debouncedLedgerQuery.trim()
              ? t("finance.matches", { n: filteredLedger.length })
              : t("finance.entries", { n: ledger.length })}
          </span>
        </header>

        {ledger.length === 0 ? (
          <p className="muted">{t("finance.noCharges")}</p>
        ) : (
          <>
            <SearchableListToolbar
              query={ledgerSearchQuery}
              onQueryChange={setLedgerSearchQuery}
              placeholder={t("finance.searchLedger")}
              ariaLabel={t("finance.searchLedgerAria")}
              matchCount={
                debouncedLedgerQuery.trim() || ledgerSearchType !== SEARCH_TYPE_ALL
                  ? filteredLedger.length
                  : undefined
              }
              totalCount={ledger.length}
              typeFilter={{
                value: ledgerSearchType,
                onChange: setLedgerSearchType,
                options: LEDGER_SEARCH_TYPES,
                ariaLabel: t("finance.filterLedgerAria"),
                label: t("finance.filterField"),
              }}
            />
            {debouncedLedgerQuery.trim() && filteredLedger.length === 0 ? (
              <p className="search-empty-hint muted">
                {t("finance.noMatches", { query: debouncedLedgerQuery })}
              </p>
            ) : null}
            <div className="tokens-ledger-wrap">
            <table className="candidate-scores-table token-ledger-table tokens-ledger-table">
              <thead>
                <tr>
                  <th>{t("finance.th.when")}</th>
                  <th>{t("finance.th.source")}</th>
                  <th>{t("finance.th.dept")}</th>
                  <th>{t("finance.th.agent")}</th>
                  <th>{t("finance.th.tokens")}</th>
                </tr>
              </thead>
              <tbody>
                {ledgerPageItems.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.at).toLocaleString()}</td>
                    <td>
                      {entry.source}
                      {entry.provider ? ` · ${entry.provider}` : ""}
                    </td>
                    <td>{entry.department}</td>
                    <td>
                      {entry.agent_id
                        ? (agentNameById.get(entry.agent_id) ?? entry.agent_id)
                        : "—"}
                    </td>
                    <td>{formatTokens(entry.total_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            <PaginationBar
              page={ledgerSafePage}
              totalPages={ledgerTotalPages}
              label={t("finance.ledgerPagination")}
              onPageChange={setLedgerPage}
            />
          </>
        )}
      </section>
      ) : null}

      {activeSection === "salaries" ? (
      <section
        id="salaries"
        className="tokens-card tokens-card--wide"
        data-tokens-section="salaries"
      >
        <header className="tokens-card-header tokens-card-header--stacked">
          <h3>{t("finance.salaryTitle")}</h3>
          <p className="muted">{t("finance.salaryDesc")}</p>
        </header>

        {agentRecords.length === 0 ? (
          <p className="muted">{t("finance.hireForSalary")}</p>
        ) : (
          <div className="tokens-salary-grid">
            {agentRecords.map((agent) => (
              <article key={agent.id} className="tokens-salary-card">
                <div className="tokens-salary-info">
                  <span className="agent-dot" style={{ backgroundColor: "#ffd166" }} />
                  <div>
                    <strong>{agent.name}</strong>
                    <p className="muted">
                      {agent.role} · {agent.department}
                      {showAgentMorale ? ` · morale ${(agent.morale * 100).toFixed(0)}%` : ""} ·{" "}
                      {agent.status}
                    </p>
                  </div>
                </div>
                <label className="field-label tokens-salary-input">
                  {t("finance.monthlySalary")}
                  <input
                    type="number"
                    className="salary-input"
                    value={salaryDrafts[agent.id] ?? Math.round(agent.salary)}
                    onChange={(event) =>
                      setSalaryDrafts((current) => ({
                        ...current,
                        [agent.id]: Number(event.target.value),
                      }))
                    }
                    onBlur={() => void commitSalary(agent.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void commitSalary(agent.id);
                      }
                    }}
                  />
                </label>
              </article>
            ))}
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}