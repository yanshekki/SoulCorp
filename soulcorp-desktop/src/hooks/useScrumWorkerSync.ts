import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";
import { notifyScrumChanged } from "../utils/scrumSync";
import { hasActiveCompany } from "../utils/companyState";

export interface WorkerTickReport {
  routed: number;
  planned: number;
  executed: number;
  approved: number;
  retried: number;
  orchestrated: number;
  meetings: number;
  delegated: number;
  sprints_advanced: number;
  gigs_submitted: number;
  messages: string[];
  timestamp: string;
}

export interface AutomationStatus {
  scrum_worker_last_tick_at?: string | null;
  scrum_worker_log: string[];
  orchestrator_last_tick_at?: string | null;
  orchestrator_log: string[];
  orchestrator_directives_total: number;
  orchestrator_meetings_total: number;
  sync_queue_pending: number;
  hub_last_pull_at?: string | null;
  company_vision: string;
  parallel_llm_enabled: boolean;
  openclaw_available: boolean;
  openclaw_version?: string | null;
  openclaw_message: string;
  readiness?: {
    items: Array<{ id: string; label: string; ok: boolean; detail: string }>;
    ready: boolean;
  };
}

/** Listen for background scrum worker ticks and refresh UI state. */
export function useScrumWorkerSync() {
  const activeCompanyId = useGameStore((s) => s.activeCompanyId);
  const companies = useGameStore((s) => s.companies);
  const setStatusMessage = useGameStore((s) => s.setStatusMessage);
  const companyReady = hasActiveCompany(activeCompanyId, companies);

  useEffect(() => {
    if (!companyReady) {
      return;
    }

    let disposed = false;
    const unlisten = listen<WorkerTickReport>("scrum-changed", (event) => {
      notifyScrumChanged();
      const report = event.payload;
      if (report.messages.length > 0) {
        setStatusMessage(report.messages[report.messages.length - 1] ?? "Scrum worker updated.");
      }
      if (report.messages.some((m) => m.includes("Workspace"))) {
        void import("../services/workspaceClient")
          .then(({ refreshWorkspaceTree }) => refreshWorkspaceTree(true))
          .catch(() => undefined);
      }
      void invoke<import("../types/game").AgentRecord[]>("list_agents")
        .then((agents) => {
          if (!disposed) {
            useGameStore.getState().setAgentRecords(agents);
          }
        })
        .catch(() => undefined);
    });

    return () => {
      disposed = true;
      void unlisten.then((fn) => fn());
    };
  }, [companyReady, setStatusMessage]);
}