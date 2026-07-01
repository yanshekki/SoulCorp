import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { AgentRecord, BudgetAllocations, InternalProject } from "../../types/game";

export function FinancePanel() {
  const finance = useGameStore((state) => state.finance);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setFinance = useGameStore((state) => state.setFinance);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [projects, setProjects] = useState<InternalProject[]>([]);
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, number>>({});

  const net = finance.monthly_revenue - finance.monthly_burn;

  useEffect(() => {
    setSalaryDrafts(
      Object.fromEntries(agentRecords.map((agent) => [agent.id, Math.round(agent.salary)])),
    );
  }, [agentRecords]);

  const loadProjects = async () => {
    try {
      const result = await invoke<InternalProject[]>("list_internal_projects");
      setProjects(result);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  useEffect(() => {
    void loadProjects();
  }, [activeCompanyId]);

  const updateAllocation = async (key: keyof BudgetAllocations, value: number) => {
    try {
      const updated = await invoke<typeof finance>("update_budget_allocations", {
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
      const updated = await invoke<typeof finance>("adjust_agent_salary", {
        update: { agent_id: agentId, salary },
      });
      const refreshedAgents = await invoke<AgentRecord[]>("list_agents");
      setFinance(updated);
      setAgentRecords(refreshedAgents);
      setStatusMessage("Salary updated.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <section className="panel-card">
      <h2>Finance & Budget</h2>

      {finance.compute_starved ? (
        <p className="finance-alert negative">Compute tokens low — agents are throttled.</p>
      ) : null}
      {finance.cash_crisis ? (
        <p className="finance-alert negative">Cash crisis — payroll pressure is hurting morale.</p>
      ) : null}

      <div className="kpi-grid finance-grid">
        <article>
          <span>Cash</span>
          <strong>${finance.cash_balance.toFixed(0)}</strong>
        </article>
        <article>
          <span>Compute</span>
          <strong>{finance.compute_tokens.toFixed(0)}</strong>
        </article>
        <article>
          <span>Burn</span>
          <strong>${finance.monthly_burn.toFixed(0)}</strong>
        </article>
        <article>
          <span>Revenue</span>
          <strong>${finance.monthly_revenue.toFixed(0)}</strong>
        </article>
      </div>

      <p className={`finance-net ${net >= 0 ? "positive" : "negative"}`}>
        Monthly net: ${net.toFixed(0)}
      </p>

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

      {projects.length > 0 ? (
        <div className="project-list compact">
          <h3>Internal Projects</h3>
          {projects.map((project) => (
            <div key={project.id} className="project-row">
              <strong>{project.title}</strong>
              <p>
                {(project.progress * 100).toFixed(0)}% · priority {project.priority} ·{" "}
                {project.owner_department}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="agent-list compact">
        <h3>Salary Efficiency</h3>
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