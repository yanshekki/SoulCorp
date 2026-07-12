import { invoke } from "../utils/tauriInvoke";
import { useEffect, useRef } from "react";
import { showAchievements, showPauseMenu, simulationAutoRun } from "../config/features";
import { useGameStore } from "../stores/gameStore";
import { useProgressStore } from "../stores/progressStore";
import type {
  AchievementSnapshot,
  AgentRecord,
  TokenEconomy,
  GameEvent,
  SidebarPanel,
  SimulationTickResult,
} from "../types/game";

import { advanceAgents } from "../utils/agentMovement";
import { syncAgentRuntime } from "../utils/agentRuntime";
import { hasActiveCompany } from "../utils/companyState";

const TICK_INTERVAL_SECONDS = 1;
const LOW_POWER_TICK_INTERVAL_SECONDS = 2;
const AGENT_REACT_SYNC_MS = 120;
const VISUAL_PANELS = new Set<SidebarPanel>(["office", "design_studio"]);

export function useSimulationLoop() {
  const isPaused = useGameStore((state) => state.isPaused);
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const companies = useGameStore((state) => state.companies);
  const companyReady = hasActiveCompany(activeCompanyId, companies);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const lastAgentSyncRef = useRef<number>(0);
  const tickAccumulatorRef = useRef(0);
  const tickInFlightRef = useRef(false);
  const tickGenerationRef = useRef(0);
  const tickInterval = lowPowerMode
    ? LOW_POWER_TICK_INTERVAL_SECONDS
    : TICK_INTERVAL_SECONDS;

  useEffect(() => {
    tickGenerationRef.current += 1;
  }, [activeCompanyId]);

  useEffect(() => {
    const paused = !simulationAutoRun || (showPauseMenu ? isPaused : false);
    if (paused || !companyReady) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const step = (time: number) => {
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      const state = useGameStore.getState();
      const {
        agents,
        agentRecords,
        buildings,
        simulation,
        activePanel,
        setAgents,
        setSimulation,
        setStatusMessage,
        setFinance,
        prependEvent,
        setAgentRecords,
        setAchievements,
        setEndings,
      } = state;

      if (VISUAL_PANELS.has(activePanel)) {
        const nextAgents = advanceAgents(
          agents,
          agentRecords,
          buildings,
          delta,
          simulation.tick,
        );
        syncAgentRuntime(nextAgents);
        if (time - lastAgentSyncRef.current >= AGENT_REACT_SYNC_MS) {
          setAgents(nextAgents);
          lastAgentSyncRef.current = time;
        }
      }

      tickAccumulatorRef.current += delta;
      if (tickAccumulatorRef.current >= tickInterval && !tickInFlightRef.current) {
        tickAccumulatorRef.current = 0;
        tickInFlightRef.current = true;
        const tickGeneration = tickGenerationRef.current;
        useProgressStore.getState().setTickInFlight(true);
        invoke<SimulationTickResult>("run_simulation_tick")
          .then(async (result) => {
            if (tickGeneration !== tickGenerationRef.current) {
              return;
            }
            setSimulation({
              tick: result.tick,
              agentsActive: result.agents_active,
              dayNumber: result.day_number,
            });
            const finance = await invoke<TokenEconomy>("get_finance_state");
            setFinance({
              ...finance,
              company_balance: result.token_balance,
              company_starved: result.company_starved,
            });
            const refreshedAgents = await invoke<AgentRecord[]>("list_agents");
            setAgentRecords(refreshedAgents);
            setStatusMessage(result.message);
            if (result.message.includes("Workspace")) {
              const { refreshWorkspaceTree } = await import("../services/workspaceClient");
              await refreshWorkspaceTree(true).catch(() => undefined);
            }
            if (showAchievements && result.event) {
              prependEvent(result.event as GameEvent);
            }
            if (showAchievements) {
              const achievements = await invoke<AchievementSnapshot>("get_achievements");
              setAchievements(achievements.achievements);
              setEndings(achievements.endings);
            }
          })
          .catch((error) => setStatusMessage(String(error)))
          .finally(() => {
            tickInFlightRef.current = false;
            useProgressStore.getState().setTickInFlight(false);
          });
      }

      frameRef.current = requestAnimationFrame(step);
    };

    lastTimeRef.current = performance.now();
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      tickInFlightRef.current = false;
    };
  }, [companyReady, isPaused, tickInterval, showPauseMenu]);
}