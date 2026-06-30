import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "../../stores/gameStore";
import type { FinanceState, GodModeActionResult } from "../../types/game";

export function GodModePanel() {
  const settings = useGameStore((state) => state.settings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setSimulation = useGameStore((state) => state.setSimulation);
  const setFinance = useGameStore((state) => state.setFinance);

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
      </div>
    </section>
  );
}