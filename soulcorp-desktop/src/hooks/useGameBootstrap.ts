import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";
import type { AgentRecord, FinanceState, GameSettings } from "../types/game";

const SAMPLE_SOULS = [
  { agentId: "agent-1", path: "/samples/mira.soul.md" },
  { agentId: "agent-2", path: "/samples/kai.soul.md" },
  { agentId: "agent-3", path: "/samples/ren.soul.md" },
];

export function useGameBootstrap() {
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setFinance = useGameStore((state) => state.setFinance);
  const setSettings = useGameStore((state) => state.setSettings);
  const setSimulation = useGameStore((state) => state.setSimulation);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [agents, finance, settings] = await Promise.all([
          invoke<AgentRecord[]>("list_agents"),
          invoke<FinanceState>("get_finance_state"),
          invoke<GameSettings>("get_game_settings"),
        ]);

        setAgentRecords(agents);
        setFinance(finance);
        setSettings(settings);
        setStatusMessage("Agent systems online. Sample SOUL profiles loading...");

        await Promise.all(
          SAMPLE_SOULS.map(async ({ agentId, path }) => {
            const response = await fetch(path);
            const soul_md_content = await response.text();
            await invoke("load_agent_soul", {
              request: {
                agent_id: agentId,
                soul_md_path: null,
                soul_md_content,
              },
            });
          }),
        );

        const refreshedAgents = await invoke<AgentRecord[]>("list_agents");
        setAgentRecords(refreshedAgents);
        setSimulation({ dayNumber: 1 });
        setStatusMessage("SOUL.md profiles loaded. Office simulation ready.");
      } catch (error) {
        setStatusMessage(`Bootstrap fallback: ${String(error)}`);
      }
    };

    void bootstrap();
  }, [setAgentRecords, setFinance, setSettings, setSimulation, setStatusMessage]);
}