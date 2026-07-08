import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";
import { useAgentActivityStore } from "../stores/agentActivityStore";
import type { AgentActivityPayload, AgentActivitySnapshot } from "../types/agentActivity";
import { hasActiveCompany } from "../utils/companyState";

export function useAgentActivity(): void {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const companies = useGameStore((state) => state.companies);
  const companyReady = hasActiveCompany(activeCompanyId, companies);
  const setSnapshot = useAgentActivityStore((state) => state.setSnapshot);
  const appendPayload = useAgentActivityStore((state) => state.appendPayload);

  useEffect(() => {
    if (!companyReady) {
      setSnapshot([], []);
      return;
    }

    let disposed = false;

    const load = async () => {
      try {
        const snapshot = await invoke<AgentActivitySnapshot>("list_agent_activity", {
          limit: 300,
        });
        if (!disposed) {
          setSnapshot(snapshot.sessions, snapshot.events);
        }
      } catch {
        // non-fatal
      }
    };

    void load();

    const unlisten = listen<AgentActivityPayload>("agent-activity", (event) => {
      appendPayload(event.payload.event, event.payload.session ?? null);
    });

    return () => {
      disposed = true;
      void unlisten.then((fn) => fn());
    };
  }, [companyReady, setSnapshot, appendPayload]);
}