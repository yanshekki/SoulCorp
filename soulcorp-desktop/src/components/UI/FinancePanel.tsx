import { useGameStore } from "../../stores/gameStore";

export function FinancePanel() {
  const finance = useGameStore((state) => state.finance);
  const agentRecords = useGameStore((state) => state.agentRecords);

  const net = finance.monthly_revenue - finance.monthly_burn;

  return (
    <section className="panel-card">
      <h2>Finance & Budget</h2>
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
      <div className="agent-list compact">
        <h3>Salary Efficiency</h3>
        {agentRecords.map((agent) => (
          <div key={agent.id} className="agent-row">
            <span className="agent-dot" style={{ backgroundColor: "#ffd166" }} />
            <div>
              <strong>{agent.name}</strong>
              <p>
                ${agent.salary.toFixed(0)} · morale {(agent.morale * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}