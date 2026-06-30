import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { FinanceState, GodModeActionResult, GodModeLogEntry } from "../../types/game";

const GOD_MODE_ACTIONS = [
  {
    command: "god_mode_time_warp",
    label: "Time Warp (+7 days)",
    args: { days: 7 },
    preview: "Fast-forward one week. Projects advance; burn accrues.",
    risk: "Agents may feel rushed; morale can dip slightly.",
  },
  {
    command: "god_mode_mass_motivation",
    label: "Mass Motivation",
    preview: "Boost company-wide morale immediately.",
    risk: "Raises reality debt; overuse breeds dependency.",
  },
  {
    command: "god_mode_emergency_budget",
    label: "Emergency Budget (+$2500)",
    args: { amount: 2500 },
    preview: "Inject cash into the company treasury.",
    risk: "Reality debt increases; agents expect future bailouts.",
  },
  {
    command: "god_mode_divine_inspiration",
    label: "Divine Inspiration",
    preview: "Temporary creativity and speed boost for all agents.",
    risk: "Crash after effect wears off if overused.",
  },
  {
    command: "god_mode_black_swan",
    label: "Black Swan Event",
    preview: "Trigger a major random event — could help or hurt.",
    risk: "Unpredictable cash and morale swings.",
  },
  {
    command: "god_mode_agent_mutation",
    label: "Agent Mutation",
    args: {},
    preview: "Randomly shift one agent's personality traits.",
    risk: "May break team chemistry or create drama.",
  },
  {
    command: "god_mode_reality_edit",
    label: "Reality Edit (top project)",
    args: {},
    preview: "Force the top project forward or repair a setback.",
    risk: "High reality debt; agents sense unnatural outcomes.",
  },
  {
    command: "god_mode_perfect_hiring",
    label: "Perfect Hiring",
    preview: "Reveal a hidden S-tier recruitment candidate.",
    risk: "Moderate reality cost; sets high salary expectations.",
  },
  {
    command: "god_mode_total_chaos",
    label: "Total Chaos Mode (24h)",
    preview: "All agents become unpredictable for one day.",
    risk: "Severe morale volatility; hard to recover quickly.",
  },
  {
    command: "god_mode_reset_agent_memory",
    label: "Reset Agent Memory",
    args: {},
    preview: "Wipe one agent's memory and relationships.",
    risk: "Traumatic for the agent; trust damage across team.",
  },
  {
    command: "god_mode_force_relationship",
    label: "Force Romance",
    args: { relationship_type: "romance" },
    preview: "Create an artificial romance between two agents.",
    risk: "May spark drama or resentment if discovered.",
  },
  {
    command: "god_mode_force_relationship",
    label: "Force Rivalry",
    args: { relationship_type: "rivalry" },
    preview: "Create an artificial rivalry between two agents.",
    risk: "Can tank meeting productivity until resolved.",
  },
] as const;

export function GodModePanel() {
  const settings = useGameStore((state) => state.settings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setSimulation = useGameStore((state) => state.setSimulation);
  const setFinance = useGameStore((state) => state.setFinance);
  const [history, setHistory] = useState<GodModeLogEntry[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  const refreshHistory = async () => {
    const entries = await invoke<GodModeLogEntry[]>("get_god_mode_history");
    setHistory(entries);
  };

  useEffect(() => {
    if (settings.god_mode_enabled) {
      void refreshHistory();
    }
  }, [settings.god_mode_enabled]);

  const runAction = async (command: string, args?: Record<string, unknown>) => {
    try {
      const result = await invoke<GodModeActionResult>(command, args ?? {});
      setSimulation({ dayNumber: result.day_number });
      const finance = await invoke<FinanceState>("get_finance_state");
      setFinance({
        ...finance,
        cash_balance: result.cash_balance,
      });
      setStatusMessage(result.message);
      await refreshHistory();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  if (!settings.god_mode_enabled) {
    return (
      <section className="panel-card">
        <h2>God Mode</h2>
        <p className="muted">Enable God Mode in Settings to use CEO powers.</p>
      </section>
    );
  }

  const activePreview = GOD_MODE_ACTIONS.find((action) => action.label === hovered);

  return (
    <section className="panel-card god-mode">
      <h2>God Mode</h2>
      <p className="muted">CEO intervention powers with visible consequences.</p>
      {activePreview ? (
        <div className="god-mode-preview">
          <strong>{activePreview.label}</strong>
          <p>{activePreview.preview}</p>
          <p className="muted">Risk: {activePreview.risk}</p>
        </div>
      ) : (
        <p className="muted god-mode-preview-hint">Hover an action to preview impact and risk.</p>
      )}
      <div className="panel-actions stacked">
        {GOD_MODE_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onMouseEnter={() => setHovered(action.label)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(action.label)}
            onBlur={() => setHovered(null)}
            onClick={() =>
              void runAction(
                action.command,
                "args" in action && action.args ? { ...action.args } : {},
              )
            }
          >
            {action.label}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div className="god-mode-history">
          <h3>Intervention Log</h3>
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <strong>Day {entry.day_number}</strong> · {entry.action.replace(/_/g, " ")}
                <span className="muted"> — {entry.message}</span>
                <span className="muted"> · reality cost {(entry.reality_cost * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}