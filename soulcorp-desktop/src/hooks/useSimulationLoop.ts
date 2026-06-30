import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useGameStore } from "../stores/gameStore";
import { advanceAgents } from "../utils/agentMovement";

interface SimulationTickResult {
  tick: number;
  agents_active: number;
  message: string;
}

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

      const { agents, setAgents, setSimulation, setStatusMessage } = useGameStore.getState();
      setAgents(advanceAgents(agents, delta));

      tickAccumulatorRef.current += delta;
      if (tickAccumulatorRef.current >= 1) {
        tickAccumulatorRef.current = 0;
        invoke<SimulationTickResult>("run_simulation_tick")
          .then((result) => {
            setSimulation({
              tick: result.tick,
              agentsActive: result.agents_active,
            });
            setStatusMessage(result.message);
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