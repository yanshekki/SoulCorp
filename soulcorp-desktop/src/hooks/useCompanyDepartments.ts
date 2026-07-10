import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { listDepartments } from "../services/departmentsClient";
import type { DepartmentListEntry, DepartmentsSnapshot } from "../types/game";

/**
 * Soft-refresh department list — keep previous snapshot while reloading.
 */
export function useCompanyDepartments() {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const [snapshot, setSnapshot] = useState<DepartmentsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const hasSnapshotRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!activeCompanyId) {
      hasSnapshotRef.current = false;
      setSnapshot(null);
      setLoading(false);
      return null;
    }
    const generation = ++loadGenerationRef.current;
    const showLoading = !hasSnapshotRef.current;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const next = await listDepartments();
      if (generation !== loadGenerationRef.current) {
        return null;
      }
      hasSnapshotRef.current = true;
      setSnapshot(next);
      return next;
    } finally {
      if (generation === loadGenerationRef.current && showLoading) {
        setLoading(false);
      }
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const departmentNames = snapshot?.departments.map((department) => department.name) ?? [];

  const departments: DepartmentListEntry[] = snapshot?.departments ?? [];

  return {
    snapshot,
    departments,
    departmentNames,
    buildings: snapshot?.buildings ?? [],
    loading,
    refresh,
  };
}
