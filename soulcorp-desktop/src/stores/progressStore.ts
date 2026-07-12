import { create } from "zustand";

export interface OperationProgress {
  operation_id: string;
  label: string;
  percent: number;
  phase?: string;
  cancellable?: boolean;
  /** Client-side timestamp when first seen */
  startedAt?: number;
}

export interface RecentOperation extends OperationProgress {
  finishedAt: number;
  status: "done" | "error";
}

interface ProgressStore {
  current: OperationProgress | null;
  /** All in-flight ops keyed by operation_id */
  operations: Record<string, OperationProgress>;
  /** Recently finished ops (for LLM Live history strip) */
  recent: RecentOperation[];
  /** User-opened LLM Live panel (footer button) */
  llmLiveOpen: boolean;
  tickInFlight: boolean;
  simTickPercent: number | null;
  simTickLabel: string | null;
  scene3dLabel: string | null;
  setProgress: (progress: OperationProgress | null) => void;
  clearProgress: (operationId?: string) => void;
  /** Mark complete but keep visible in LLM Live for a while */
  finishProgress: (operationId: string, label?: string, status?: "done" | "error") => void;
  setLlmLiveOpen: (open: boolean) => void;
  setTickInFlight: (inFlight: boolean) => void;
  setSimTickProgress: (label: string | null, percent: number | null) => void;
  setScene3dLabel: (label: string | null) => void;
}

const RECENT_TTL_MS = 12_000;
const MAX_RECENT = 12;

function pruneRecent(recent: RecentOperation[], now = Date.now()): RecentOperation[] {
  return recent
    .filter((entry) => now - entry.finishedAt < RECENT_TTL_MS)
    .slice(-MAX_RECENT);
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  current: null,
  operations: {},
  recent: [],
  llmLiveOpen: false,
  tickInFlight: false,
  simTickPercent: null,
  simTickLabel: null,
  scene3dLabel: null,
  setProgress: (progress) => {
    if (!progress) {
      set({ current: null });
      return;
    }
    const withStart: OperationProgress = {
      ...progress,
      startedAt:
        get().operations[progress.operation_id]?.startedAt ??
        progress.startedAt ??
        Date.now(),
    };
    set((state) => ({
      current: withStart,
      operations: {
        ...state.operations,
        [withStart.operation_id]: withStart,
      },
      recent: pruneRecent(state.recent),
    }));
  },
  clearProgress: (operationId) => {
    const { current, operations, recent } = get();
    if (!operationId) {
      set({ current: null, operations: {}, recent: pruneRecent(recent) });
      return;
    }
    const nextOps = { ...operations };
    const removed = nextOps[operationId];
    delete nextOps[operationId];
    const now = Date.now();
    let nextRecent = pruneRecent(recent, now);
    if (removed && isLlmLikeProgress(removed.operation_id, removed.phase, removed.label)) {
      nextRecent = pruneRecent(
        [
          ...nextRecent,
          {
            ...removed,
            percent: 100,
            phase: "done",
            finishedAt: now,
            status: "done",
          },
        ],
        now,
      );
    }
    const nextCurrent =
      current?.operation_id === operationId
        ? Object.values(nextOps).sort(
            (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
          )[0] ?? null
        : current;
    set({ current: nextCurrent, operations: nextOps, recent: nextRecent });
  },
  finishProgress: (operationId, label, status = "done") => {
    const { operations, recent, current } = get();
    const existing = operations[operationId] ?? current;
    const now = Date.now();
    const finished: RecentOperation = {
      operation_id: operationId,
      label: label ?? existing?.label ?? operationId,
      percent: 100,
      phase: status === "error" ? "error" : "done",
      startedAt: existing?.startedAt ?? now,
      finishedAt: now,
      status,
    };
    const nextOps = { ...operations };
    delete nextOps[operationId];
    const nextCurrent =
      current?.operation_id === operationId
        ? Object.values(nextOps).sort(
            (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
          )[0] ?? null
        : current;
    set({
      current: nextCurrent,
      operations: nextOps,
      recent: pruneRecent([...recent, finished], now),
    });
  },
  setLlmLiveOpen: (llmLiveOpen) => set({ llmLiveOpen }),
  setTickInFlight: (tickInFlight) => set({ tickInFlight }),
  setSimTickProgress: (simTickLabel, simTickPercent) => set({ simTickLabel, simTickPercent }),
  setScene3dLabel: (scene3dLabel) => set({ scene3dLabel }),
}));

export function reportLocalProgress(
  operationId: string,
  label: string,
  percent: number,
  phase?: string,
): void {
  useProgressStore.getState().setProgress({
    operation_id: operationId,
    label,
    percent,
    phase,
  });
}

export function clearLocalProgress(operationId: string): void {
  useProgressStore.getState().clearProgress(operationId);
}

export function finishProgress(
  operationId: string,
  label?: string,
  status: "done" | "error" = "done",
): void {
  useProgressStore.getState().finishProgress(operationId, label, status);
}

/** Whether this progress event should surface as LLM Live chrome. */
export function isLlmLikeProgress(
  operationId: string | undefined,
  phase: string | undefined,
  label?: string,
  opts?: { includeFinished?: boolean },
): boolean {
  if (phase === "meeting_close" || phase === "clear") {
    return false;
  }
  if (!opts?.includeFinished && (phase === "done" || phase === "error")) {
    return false;
  }
  if (phase === "llm" || phase === "org") {
    return true;
  }
  const op = (operationId ?? "").toLowerCase();
  const lab = (label ?? "").toLowerCase();
  return (
    op.startsWith("meeting_") ||
    op.includes("co_ceo") ||
    op.includes("briefing") ||
    op.includes("llm") ||
    op.includes("assign_org") ||
    op.includes("generate_department") ||
    op.includes("hire") ||
    op.includes("execution") ||
    lab.includes("generating") ||
    lab.includes("assigning") ||
    lab.includes("designing company") ||
    lab.includes("thinking") ||
    lab.includes("llm") ||
    lab.includes("department")
  );
}

/** Org AI tools that should stay visible longer in LLM Live. */
export function isOrgAiOperation(operationId: string): boolean {
  const op = operationId.toLowerCase();
  return (
    op.includes("assign_org") ||
    op.includes("generate_department") ||
    op.includes("org_with_ai")
  );
}
