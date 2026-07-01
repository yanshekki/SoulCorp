import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { totalCompanyTokens } from "../../utils/companyState";
import type {
  AgentRecord,
  BudgetAllocations,
  TokenEconomy,
  TokenEconomySnapshot,
  TokenUsageEntry,
} from "../../types/game";

function formatTokens(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function FinancePanel() {
  const finance = useGameStore((state) => state.finance);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setFinance = useGameStore((state) => state.setFinance);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [ledger, setLedger] = useState<TokenUsageEntry[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, number>>({});
  const [deptAllocDrafts, setDeptAllocDrafts] = useState<Record<string, number>>({});
  const [agentAllocDrafts, setAgentAllocDrafts] = useState<Record<string, number>>({});
  const [rebalancing, setRebalancing] = useState(false);

  const net = finance.monthly_inflow_tokens - finance.monthly_burn_tokens;
  const displayTotal = totalTokens > 0 ? totalTokens : totalCompanyTokens(finance);

  const agentNameById = useMemo(
    () => new Map(agentRecords.map((agent) => [agent.id, agent.name])),
    [agentRecords],
  );

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
    <section className="panel-card">
      <h2>Token Budget</h2>

      {finance.company_starved ? (
        <p className="finance-alert negative hub-warning">
          Company token pool depleted — agents are throttled.
        </p>
      ) : null}

      <div className="kpi-grid finance-grid">
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
      </div>

      <p className={`finance-net ${net >= 0 ? "positive" : "negative"}`}>
        Monthly net: {net >= 0 ? "+" : ""}
        {formatTokens(net)} tokens
      </p>

      <div className="panel-actions">
        <button type="button" className="primary-action" onClick={() => void rebalanceWallets()} disabled={rebalancing}>
          {rebalancing ? "Rebalancing…" : "Rebalance wallets"}
        </button>
        <button type="button" onClick={() => void refreshSnapshot()}>
          Refresh ledger
        </button>
      </div>

      <div className="budget-allocation">
        <h3>Budget Allocation</h3>
        {(
          [
            ["compute_pct", "Compute / AI"],
            ["salaries_pct", "Salaries"],
            ["marketing_pct", "Marketing"],
            ["rnd_pct", "R&D"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="budget-slider">
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

      <div className="agent-list compact">
        <h3>Department wallets</h3>
        {departmentRows.length === 0 ? (
          <p className="muted">No department wallets yet. Hire agents or rebalance to initialize.</p>
        ) : (
          departmentRows.map(([department, wallet]) => (
            <div key={department} className="agent-row salary-row">
              <div>
                <strong>{department}</strong>
                <p>
                  balance {formatTokens(wallet.balance)} · allocated {formatTokens(wallet.allocated)} ·
                  spent {formatTokens(wallet.spent)}
                </p>
              </div>
              <input
                type="number"
                className="salary-input"
                min={0}
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
          ))
        )}
      </div>

      <div className="agent-list compact">
        <h3>Agent wallets</h3>
        {agentWalletRows.length === 0 ? (
          <p className="muted">No agent wallets yet.</p>
        ) : (
          agentWalletRows.map(({ agentId, name, wallet }) => (
            <div key={agentId} className="agent-row salary-row">
              <div>
                <strong>{name}</strong>
                <p>
                  balance {formatTokens(wallet.balance)} · allocated {formatTokens(wallet.allocated)} ·
                  spent {formatTokens(wallet.spent)}
                </p>
              </div>
              <input
                type="number"
                className="salary-input"
                min={0}
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
          ))
        )}
      </div>

      <div className="token-ledger">
        <h3>Usage ledger</h3>
        {ledger.length === 0 ? (
          <p className="muted">No token charges recorded yet.</p>
        ) : (
          <table className="candidate-scores-table token-ledger-table">
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
        )}
      </div>

      <div className="agent-list compact">
        <h3>Salary efficiency</h3>
        {agentRecords.map((agent) => (
          <div key={agent.id} className="agent-row salary-row">
            <span className="agent-dot" style={{ backgroundColor: "#ffd166" }} />
            <div>
              <strong>{agent.name}</strong>
              <p>
                morale {(agent.morale * 100).toFixed(0)}% · {agent.status}
              </p>
            </div>
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
          </div>
        ))}
      </div>
    </section>
  );
}