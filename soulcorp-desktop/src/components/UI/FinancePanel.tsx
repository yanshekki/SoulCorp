import { invoke } from "@tauri-apps/api/core";
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
import { showAgentMorale } from "../../config/features";
import { AgentTokenBudgetEditor } from "./AgentTokenBudgetEditor";
import { agentLabelById } from "../../utils/agentLabel";

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
  onSectionFocus?: (sectionId: string) => void;
  onNavigateSection?: (sectionId: string) => void;
}

export function FinancePanel({ onSectionFocus, onNavigateSection }: FinancePanelProps) {
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
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const net = finance.monthly_inflow_tokens - finance.monthly_burn_tokens;
  const displayTotal = totalTokens > 0 ? totalTokens : totalCompanyTokens(finance);

  const agentNameById = useMemo(() => agentLabelById(agentRecords), [agentRecords]);

  const departmentRows = useMemo(
    () =>
      Object.entries(finance.departments).sort(([left], [right]) => left.localeCompare(right)),
    [finance.departments],
  );

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
    if (!onSectionFocus) {
      return;
    }
    const root = scrollRootRef.current?.closest(".app-page-content");
    const sections = scrollRootRef.current?.querySelectorAll("[data-tokens-section]");
    if (!root || !sections?.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-tokens-section");
        if (sectionId) {
          onSectionFocus(sectionId);
        }
      },
      { root, rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onSectionFocus, departmentRows.length, agentWalletRows.length, ledger.length, agentRecords.length]);

  const updateAllocation = async (key: keyof BudgetAllocations, value: number) => {
    try {
      const updated = await invoke<TokenEconomy>("update_budget_allocations", {
        update: { [key]: value },
      });
      setFinance(updated);
      setStatusMessage("Budget allocation updated.");
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
      setStatusMessage("Salary updated.");
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const allocateDepartment = async (department: string) => {
    const amount = deptAllocDrafts[department] ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusMessage("Enter a positive token amount for the department.");
      return;
    }
    try {
      const updated = await invoke<TokenEconomy>("allocate_department_tokens_cmd", {
        request: { department, amount },
      });
      setFinance(updated);
      setDeptAllocDrafts((current) => ({ ...current, [department]: 0 }));
      setStatusMessage(`Allocated ${formatTokens(amount)} tokens to ${department}.`);
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const allocateAgent = async (agentId: string) => {
    const amount = agentAllocDrafts[agentId] ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusMessage("Enter a positive token amount for the agent.");
      return;
    }
    try {
      const updated = await invoke<TokenEconomy>("allocate_agent_tokens_cmd", {
        request: { agent_id: agentId, amount },
      });
      setFinance(updated);
      setAgentAllocDrafts((current) => ({ ...current, [agentId]: 0 }));
      const name = agentNameById.get(agentId) ?? agentId;
      setStatusMessage(`Allocated ${formatTokens(amount)} tokens to ${name}.`);
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
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
      setStatusMessage(`${department} token budget updated.`);
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
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
      setStatusMessage(`${name} token budget updated.`);
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSavingBudgetKey(null);
    }
  };

  const rebalanceWallets = async () => {
    setRebalancing(true);
    try {
      const updated = await invoke<TokenEconomy>("rebalance_token_wallets_cmd");
      setFinance(updated);
      setStatusMessage("Token wallets rebalanced across departments and agents.");
      await refreshSnapshot();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setRebalancing(false);
    }
  };

  return (
    <div className="finance-panel finance-panel--page" ref={scrollRootRef}>
      <section
        id="overview"
        className="tokens-card tokens-card--wide"
        data-tokens-section="overview"
      >
        <header className="tokens-card-header tokens-card-header--stacked">
          <h3>Token overview</h3>
          <p className="muted">
            Company pool health, monthly burn vs inflow, and wallet distribution across the org.
          </p>
        </header>

        {finance.company_starved ? (
          <p className="finance-alert negative hub-warning">
            Company token pool depleted — agents are throttled.
          </p>
        ) : null}

        <div className="kpi-grid tokens-stats-grid">
          <article>
            <span>Company pool</span>
            <strong>{formatTokens(finance.company_balance)}</strong>
          </article>
          <article>
            <span>Total tokens</span>
            <strong>{formatTokens(displayTotal)}</strong>
          </article>
          <article>
            <span>Monthly burn</span>
            <strong>{formatTokens(finance.monthly_burn_tokens)}</strong>
          </article>
          <article>
            <span>Monthly inflow</span>
            <strong>{formatTokens(finance.monthly_inflow_tokens)}</strong>
          </article>
          <article>
            <span>Dept period caps</span>
            <strong>{deptBudgetCount}</strong>
          </article>
          <article>
            <span>Agent period caps</span>
            <strong>{agentBudgetCount}</strong>
          </article>
        </div>

        <p className={`finance-net tokens-net ${net >= 0 ? "positive" : "negative"}`}>
          Monthly net: {net >= 0 ? "+" : ""}
          {formatTokens(net)} tokens
        </p>

        <div className="tokens-card-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => void rebalanceWallets()}
            disabled={rebalancing}
          >
            {rebalancing ? "Rebalancing…" : "Rebalance wallets"}
          </button>
          <button type="button" className="secondary-action" onClick={() => void refreshSnapshot()}>
            Refresh ledger
          </button>
          <button type="button" className="secondary-action" onClick={() => onNavigateSection?.("departments")}>
            Allocate tokens
          </button>
        </div>
      </section>

      <section
        id="allocation"
        className="tokens-card tokens-card--wide"
        data-tokens-section="allocation"
      >
        <header className="tokens-card-header tokens-card-header--stacked">
          <h3>Budget split</h3>
          <p className="muted">
            How monthly token inflow is divided across compute, salaries, marketing, and R&amp;D.
          </p>
        </header>

        <div className="budget-allocation tokens-budget-allocation">
          {(
            [
              ["compute_pct", "Compute / AI"],
              ["salaries_pct", "Salaries"],
              ["marketing_pct", "Marketing"],
              ["rnd_pct", "R&D"],
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

      <section
        id="departments"
        className="tokens-card tokens-card--wide"
        data-tokens-section="departments"
      >
        <header className="tokens-card-header">
          <div>
            <h3>Department wallets</h3>
            <p className="muted tokens-card-subtitle">
              Allocate from the company pool and set weekly–yearly period caps per department.
            </p>
          </div>
          <span className="tokens-count-pill">{departmentRows.length} departments</span>
        </header>

        {departmentRows.length === 0 ? (
          <p className="muted">No department wallets yet. Hire agents or rebalance to initialize.</p>
        ) : (
          <div className="tokens-wallet-grid">
            {departmentRows.map(([department, wallet]) => (
              <article key={department} className="tokens-wallet-card tokens-wallet-card--budget">
                <header>
                  <strong>{department}</strong>
                  <span className="tokens-wallet-meta">
                    Allocated {formatTokens(wallet.allocated)}
                  </span>
                </header>
                <div className="tokens-wallet-actions">
                  <input
                    type="number"
                    className="salary-input"
                    min={0}
                    placeholder="Amount"
                    value={deptAllocDrafts[department] ?? 0}
                    onChange={(event) =>
                      setDeptAllocDrafts((current) => ({
                        ...current,
                        [department]: Number(event.target.value),
                      }))
                    }
                  />
                  <button type="button" onClick={() => void allocateDepartment(department)}>
                    Allocate
                  </button>
                </div>
                <AgentTokenBudgetEditor
                  wallet={wallet}
                  saving={savingBudgetKey === `dept:${department}`}
                  onSave={(policy) => void saveDepartmentBudget(department, policy)}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        id="agents"
        className="tokens-card tokens-card--wide"
        data-tokens-section="agents"
      >
        <header className="tokens-card-header">
          <div>
            <h3>Agent wallets</h3>
            <p className="muted tokens-card-subtitle">
              Distribute department tokens and set per-employee period caps for LLM usage.
            </p>
          </div>
          <span className="tokens-count-pill">{agentWalletRows.length} agents</span>
        </header>

        {agentWalletRows.length === 0 ? (
          <p className="muted">No agent wallets yet.</p>
        ) : (
          <div className="tokens-wallet-grid">
            {agentWalletRows.map(({ agentId, name, wallet }) => (
              <article key={agentId} className="tokens-wallet-card tokens-wallet-card--budget">
                <header>
                  <strong>{name}</strong>
                  <span className="tokens-wallet-meta">
                    Allocated {formatTokens(wallet.allocated)}
                  </span>
                </header>
                <div className="tokens-wallet-actions">
                  <input
                    type="number"
                    className="salary-input"
                    min={0}
                    placeholder="Amount"
                    value={agentAllocDrafts[agentId] ?? 0}
                    onChange={(event) =>
                      setAgentAllocDrafts((current) => ({
                        ...current,
                        [agentId]: Number(event.target.value),
                      }))
                    }
                  />
                  <button type="button" onClick={() => void allocateAgent(agentId)}>
                    Allocate
                  </button>
                </div>
                <AgentTokenBudgetEditor
                  wallet={wallet}
                  saving={savingBudgetKey === `agent:${agentId}`}
                  onSave={(policy) => void saveAgentBudget(agentId, policy)}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        id="ledger"
        className="tokens-card tokens-card--wide"
        data-tokens-section="ledger"
      >
        <header className="tokens-card-header">
          <div>
            <h3>Usage ledger</h3>
            <p className="muted tokens-card-subtitle">
              Recent token charges by source, department, and agent.
            </p>
          </div>
          <span className="tokens-count-pill">{ledger.length} entries</span>
        </header>

        {ledger.length === 0 ? (
          <p className="muted">No token charges recorded yet.</p>
        ) : (
          <div className="tokens-ledger-wrap">
            <table className="candidate-scores-table token-ledger-table tokens-ledger-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Dept</th>
                  <th>Agent</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
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
        )}
      </section>

      <section
        id="salaries"
        className="tokens-card tokens-card--wide"
        data-tokens-section="salaries"
      >
        <header className="tokens-card-header tokens-card-header--stacked">
          <h3>Salary efficiency</h3>
          <p className="muted">
            Adjust monthly salaries — changes affect monthly burn rate.
          </p>
        </header>

        {agentRecords.length === 0 ? (
          <p className="muted">Hire agents to manage salaries.</p>
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
                  Monthly salary
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
    </div>
  );
}