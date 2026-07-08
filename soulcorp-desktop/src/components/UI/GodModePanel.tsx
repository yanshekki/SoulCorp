import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useCompanyScope } from "../../hooks/useCompanyScope";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import type { GodModeActionResult, GodModeLogEntry, TokenEconomy } from "../../types/game";
import { filterByQuery } from "../../utils/listSearch";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "./PaginationBar";
import { SearchableListToolbar } from "./SearchableListToolbar";

const GOD_MODE_LOG_PAGE_SIZE = 20;

export type GodModeCategory = "simulation" | "economy" | "agents" | "chaos";

export const GOD_MODE_CATEGORIES: { id: GodModeCategory; label: string }[] = [
  { id: "simulation", label: "Simulation" },
  { id: "economy", label: "Economy" },
  { id: "agents", label: "Agents" },
  { id: "chaos", label: "Chaos" },
];

type GodModeAction = {
  command: string;
  label: string;
  category: GodModeCategory;
  preview: string;
  risk: string;
  args?: Record<string, unknown>;
};

export const GOD_MODE_ACTIONS: GodModeAction[] = [
  {
    command: "god_mode_time_warp",
    label: "Time Warp (+7 days)",
    category: "simulation",
    args: { days: 7 },
    preview: "Fast-forward one week. Projects advance; burn accrues.",
    risk: "Agents may feel rushed; morale can dip slightly.",
  },
  {
    command: "god_mode_mass_motivation",
    label: "Mass Motivation",
    category: "agents",
    preview: "Boost company-wide morale immediately.",
    risk: "Raises reality debt; overuse breeds dependency.",
  },
  {
    command: "god_mode_emergency_budget",
    label: "Emergency Budget (+2500 tokens)",
    category: "economy",
    args: { amount: 2500 },
    preview: "Inject tokens into the company pool.",
    risk: "Reality debt increases; agents expect future bailouts.",
  },
  {
    command: "god_mode_divine_inspiration",
    label: "Divine Inspiration",
    category: "agents",
    preview: "Temporary creativity and speed boost for all agents.",
    risk: "Crash after effect wears off if overused.",
  },
  {
    command: "god_mode_black_swan",
    label: "Black Swan Event",
    category: "chaos",
    preview: "Trigger a major random event — could help or hurt.",
    risk: "Unpredictable cash and morale swings.",
  },
  {
    command: "god_mode_agent_mutation",
    label: "Agent Mutation",
    category: "agents",
    args: {},
    preview: "Randomly shift one agent's personality traits.",
    risk: "May break team chemistry or create drama.",
  },
  {
    command: "god_mode_reality_edit",
    label: "Reality Edit (top project)",
    category: "economy",
    args: {},
    preview: "Force the top project forward or repair a setback.",
    risk: "High reality debt; agents sense unnatural outcomes.",
  },
  {
    command: "god_mode_perfect_hiring",
    label: "Perfect Hiring",
    category: "economy",
    preview: "Reveal a hidden S-tier recruitment candidate.",
    risk: "Moderate reality cost; sets high salary expectations.",
  },
  {
    command: "god_mode_total_chaos",
    label: "Total Chaos Mode (24h)",
    category: "chaos",
    preview: "All agents become unpredictable for one day.",
    risk: "Severe morale volatility; hard to recover quickly.",
  },
  {
    command: "god_mode_reset_agent_memory",
    label: "Reset Agent Memory",
    category: "agents",
    args: {},
    preview: "Wipe one agent's memory and relationships.",
    risk: "Traumatic for the agent; trust damage across team.",
  },
  {
    command: "god_mode_force_relationship",
    label: "Force Romance",
    category: "agents",
    args: { relationshipType: "romance" },
    preview: "Create an artificial romance between two agents.",
    risk: "May spark drama or resentment if discovered.",
  },
  {
    command: "god_mode_force_relationship",
    label: "Force Rivalry",
    category: "agents",
    args: { relationshipType: "rivalry" },
    preview: "Create an artificial rivalry between two agents.",
    risk: "Can tank meeting productivity until resolved.",
  },
];

interface GodModeDisabledGateProps {
  onEnable: () => void;
  busy?: boolean;
}

export function GodModeDisabledGate({ onEnable, busy }: GodModeDisabledGateProps) {
  return (
    <div className="god-mode-disabled-gate">
      <div className="god-mode-disabled-card">
        <h3>CEO intervention powers</h3>
        <p className="muted">
          God Mode lets you bend simulation rules — time warps, emergency budgets, agent mutations,
          and more. Every action raises <strong>reality debt</strong>; agents eventually sense
          unnatural outcomes.
        </p>
        <ul className="god-mode-disabled-list">
          <li>12 intervention powers across simulation, economy, agents, and chaos</li>
          <li>Visible reality debt meter and intervention log</li>
          <li>Consequences persist in finance, morale, and agent relationships</li>
        </ul>
        <button type="button" className="primary-action" onClick={onEnable} disabled={busy}>
          {busy ? "Enabling…" : "Enable God Mode"}
        </button>
      </div>
    </div>
  );
}

function RealityDebtMeter({ realityDebt }: { realityDebt: number }) {
  return (
    <div className="reality-debt-meter" aria-label="Reality debt">
      <span>Reality debt {(realityDebt * 100).toFixed(0)}%</span>
      <div className="reality-debt-bar">
        <span
          className={realityDebt >= 0.35 ? "reality-debt-fill warning" : "reality-debt-fill"}
          style={{ width: `${Math.round(realityDebt * 100)}%` }}
        />
      </div>
      {realityDebt >= 0.35 ? (
        <p className="muted">High debt — agents sense unnatural outcomes.</p>
      ) : null}
    </div>
  );
}

export function GodModePanel() {
  const { activeCompanyId, companyRevision } = useCompanyScope();
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setSimulation = useGameStore((state) => state.setSimulation);
  const setFinance = useGameStore((state) => state.setFinance);
  const [history, setHistory] = useState<GodModeLogEntry[]>([]);
  const [selected, setSelected] = useState<string>(GOD_MODE_ACTIONS[0].label);
  const [realityDebt, setRealityDebt] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
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
    setRunning(action.label);
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

  const filteredHistory = useMemo(
    () =>
      filterByQuery(history, debouncedHistoryQuery, (entry) => [
        entry.action,
        entry.message,
        String(entry.day_number),
        String(entry.reality_cost),
      ]),
    [history, debouncedHistoryQuery],
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
  }, [debouncedHistoryQuery, history.length]);

  const activePreview = GOD_MODE_ACTIONS.find((action) => action.label === selected);

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
                <h3>{category.label}</h3>
                <div className="god-mode-action-grid">
                  {actions.map((action) => (
                    <article
                      key={action.label}
                      className={`god-mode-action-card${selected === action.label ? " selected" : ""}`}
                      onMouseEnter={() => setSelected(action.label)}
                      onFocus={() => setSelected(action.label)}
                    >
                      <div className="god-mode-action-card-body">
                        <strong>{action.label}</strong>
                        <p className="muted">{action.preview}</p>
                      </div>
                      <button
                        type="button"
                        className="god-mode-action-btn"
                        disabled={running !== null}
                        onClick={() => void runAction(action)}
                      >
                        {running === action.label ? "Running…" : "Execute"}
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
              <strong>{activePreview.label}</strong>
              <p>{activePreview.preview}</p>
              <p className="muted">Risk: {activePreview.risk}</p>
              <button
                type="button"
                className="primary-action"
                disabled={running !== null}
                onClick={() => void runAction(activePreview)}
              >
                {running === activePreview.label ? "Running…" : `Execute ${activePreview.label}`}
              </button>
            </div>
          ) : null}

          <div className="god-mode-history">
            <h3>Intervention Log</h3>
            {history.length > 0 ? (
              <>
                <SearchableListToolbar
                  query={historySearchQuery}
                  onQueryChange={setHistorySearchQuery}
                  placeholder="Search interventions…"
                  ariaLabel="Search intervention log"
                  matchCount={
                    debouncedHistoryQuery.trim() ? filteredHistory.length : undefined
                  }
                  totalCount={history.length}
                />
                {debouncedHistoryQuery.trim() && filteredHistory.length === 0 ? (
                  <p className="search-empty-hint muted">
                    No matches for &ldquo;{debouncedHistoryQuery}&rdquo;.
                  </p>
                ) : null}
                <ul>
                  {historyPageItems.map((entry) => (
                    <li key={entry.id}>
                      <strong>Day {entry.day_number}</strong> · {entry.action.replace(/_/g, " ")}
                      <span className="muted"> — {entry.message}</span>
                      <span className="muted">
                        {" "}
                        · reality cost {(entry.reality_cost * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
                <PaginationBar
                  page={historySafePage}
                  totalPages={historyTotalPages}
                  label="Interventions"
                  onPageChange={setHistoryPage}
                />
              </>
            ) : (
              <p className="muted">No interventions yet. Execute a power to begin the log.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}