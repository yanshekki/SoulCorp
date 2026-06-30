import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { FinanceState, GodModeActionResult, GodModeLogEntry } from "../../types/game";

export function GodModePanel() {
  const settings = useGameStore((state) => state.settings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setSimulation = useGameStore((state) => state.setSimulation);
  const setFinance = useGameStore((state) => state.setFinance);
  const [history, setHistory] = useState<GodModeLogEntry[]>([]);

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

  return (
    <section className="panel-card god-mode">
      <h2>God Mode</h2>
      <p className="muted">CEO intervention powers with visible consequences.</p>
      <div className="panel-actions stacked">
        <button type="button" onClick={() => void runAction("god_mode_time_warp", { days: 7 })}>
          Time Warp (+7 days)
        </button>
        <button type="button" onClick={() => void runAction("god_mode_mass_motivation")}>
          Mass Motivation
        </button>
        <button
          type="button"
          onClick={() => void runAction("god_mode_emergency_budget", { amount: 2500 })}
        >
          Emergency Budget (+$2500)
        </button>
        <button type="button" onClick={() => void runAction("god_mode_divine_inspiration")}>
          Divine Inspiration
        </button>
        <button type="button" onClick={() => void runAction("god_mode_black_swan")}>
          Black Swan Event
        </button>
        <button type="button" onClick={() => void runAction("god_mode_agent_mutation", {})}>
          Agent Mutation
        </button>
        <button type="button" onClick={() => void runAction("god_mode_reality_edit", {})}>
          Reality Edit (top project)
        </button>
      </div>

      {history.length > 0 && (
        <div className="god-mode-history">
          <h3>Intervention Log</h3>
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <strong>Day {entry.day_number}</strong> · {entry.action.replace(/_/g, " ")}
                <span className="muted"> — {entry.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}