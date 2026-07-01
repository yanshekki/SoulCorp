import { create } from "zustand";

export interface OperationProgress {
  operation_id: string;
  label: string;
  percent: number;
  phase?: string;
  cancellable?: boolean;
}

interface ProgressStore {
  current: OperationProgress | null;
  tickInFlight: boolean;
  simTickPercent: number | null;
  simTickLabel: string | null;
  scene3dLabel: string | null;
  setProgress: (progress: OperationProgress | null) => void;
  clearProgress: (operationId?: string) => void;
  setTickInFlight: (inFlight: boolean) => void;
  setSimTickProgress: (label: string | null, percent: number | null) => void;
  setScene3dLabel: (label: string | null) => void;
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  current: null,
  tickInFlight: false,
  simTickPercent: null,
  simTickLabel: null,
  scene3dLabel: null,
  setProgress: (progress) => set({ current: progress }),
  clearProgress: (operationId) => {
    const { current } = get();
    if (!operationId || current?.operation_id === operationId) {
      set({ current: null });
    }
  },
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