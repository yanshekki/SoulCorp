import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";
import type {
  AchievementSnapshot,
  AgentRecord,
  FinanceState,
  GameEvent,
  SimulationTickResult,
} from "../types/game";
import { advanceAgents } from "../utils/agentMovement";

export function useSimulationLoop() {
  const isPaused = useGameStore((state) => state.isPaused);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const tickAccumulatorRef = useRef(0);

  useEffect(() => {
    if (isPaused) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const step = (time: number) => {
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      const {
        agents,
        agentRecords,
        buildings,
        simulation,
        setAgents,
        setSimulation,
        setStatusMessage,
        setFinance,
        prependEvent,
        setAgentRecords,
        setAchievements,
        setEndings,
      } = useGameStore.getState();

      setAgents(advanceAgents(agents, agentRecords, buildings, delta, simulation.tick));

      tickAccumulatorRef.current += delta;
      if (tickAccumulatorRef.current >= 1) {
        tickAccumulatorRef.current = 0;
        invoke<SimulationTickResult>("run_simulation_tick")
          .then(async (result) => {
            setSimulation({
              tick: result.tick,
              agentsActive: result.agents_active,
              dayNumber: result.day_number,
            });
            const finance = await invoke<FinanceState>("get_finance_state");
            setFinance({
              ...finance,
              cash_balance: result.cash_balance,
            });
            const refreshedAgents = await invoke<AgentRecord[]>("list_agents");
            setAgentRecords(refreshedAgents);
            setStatusMessage(result.message);
            if (result.event) {
              prependEvent(result.event as GameEvent);
            }
            const achievements = await invoke<AchievementSnapshot>("get_achievements");
            setAchievements(achievements.achievements);
            setEndings(achievements.endings);
          })
          .catch((error) => setStatusMessage(String(error)));
      }

      frameRef.current = requestAnimationFrame(step);
    };

    lastTimeRef.current = performance.now();
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isPaused]);
}