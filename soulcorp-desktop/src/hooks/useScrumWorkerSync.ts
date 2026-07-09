import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
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

const DEBOUNCE_MS = 300;

/** Listen for background scrum worker ticks and refresh UI state. */
export function useScrumWorkerSync() {
  const activeCompanyId = useGameStore((s) => s.activeCompanyId);
  const companies = useGameStore((s) => s.companies);
  const setStatusMessage = useGameStore((s) => s.setStatusMessage);
  const companyReady = hasActiveCompany(activeCompanyId, companies);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        if (disposed) {
          return;
        }
        void import("../services/autopilotClient")
          .then(({ getAutopilotSnapshot }) => getAutopilotSnapshot())
          .catch(() => undefined);
        void invoke<import("../types/game").AgentRecord[]>("list_agents")
          .then((agents) => {
            if (!disposed) {
              useGameStore.getState().setAgentRecords(agents);
            }
          })
          .catch(() => undefined);
        const workspaceContentChanged = report.messages.some(
          (m) => m.includes("Workspace") && (m.includes("page") || m.includes("deliverable")),
        );
        if (workspaceContentChanged) {
          void import("../services/workspaceClient")
            .then(({ refreshWorkspaceTree }) => refreshWorkspaceTree(false))
            .catch(() => undefined);
        }
        const orgStructureChanged = report.messages.some(
          (m) =>
            m.includes("Auto-recruited") ||
            m.includes("joined") ||
            m.includes("hired") ||
            m.includes("new agent"),
        );
        if (orgStructureChanged) {
          void import("../services/workspaceClient")
            .then(({ syncWorkspaceFoldersAfterOrgChange }) => syncWorkspaceFoldersAfterOrgChange())
            .catch(() => undefined);
        }
      }, DEBOUNCE_MS);
    });

    return () => {
      disposed = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      void unlisten.then((fn) => fn());
    };
  }, [companyReady, setStatusMessage]);
}