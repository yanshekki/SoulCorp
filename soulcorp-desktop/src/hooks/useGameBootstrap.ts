import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { getHubStatus } from "../services/hubClient";
import { useGameStore } from "../stores/gameStore";
import type {
  AgentRecord,
  FinanceState,
  GameSettings,
  HubStatus,
  TierBenefits,
} from "../types/game";

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
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const setTierBenefits = useGameStore((state) => state.setTierBenefits);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [agents, finance, settings, hubStatus] = await Promise.all([
          invoke<AgentRecord[]>("list_agents"),
          invoke<FinanceState>("get_finance_state"),
          invoke<GameSettings>("get_game_settings"),
          getHubStatus().catch(
            (): HubStatus => ({
              connected: false,
              base_url: "https://soulmd-hub.ysk.hk",
              user_tier: "free",
              soul_balance: 0,
              pure_local_mode: false,
              pending_queue_items: 0,
              last_sync_at: null,
            }),
          ),
        ]);

        setAgentRecords(agents);
        setFinance(finance);
        setSettings(settings);
        setHubStatus(hubStatus);
        const tierBenefits = await invoke<TierBenefits>("get_tier_benefits").catch(
          (): TierBenefits => ({
            tier: "free",
            platform_fee_percent: 10,
            max_agents: 50,
            cloud_sync_enabled: false,
            priority_gig_matching: false,
            event_foresight_days: 0,
            white_label_export: false,
            executive_lounge: false,
          }),
        );
        setTierBenefits(tierBenefits);
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
  }, [
    setAgentRecords,
    setFinance,
    setHubStatus,
    setTierBenefits,
    setSettings,
    setSimulation,
    setStatusMessage,
  ]);
}