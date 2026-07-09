import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { listDepartments } from "../services/departmentsClient";
import type { DepartmentListEntry, DepartmentsSnapshot } from "../types/game";

export function useCompanyDepartments() {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const [snapshot, setSnapshot] = useState<DepartmentsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeCompanyId) {
      setSnapshot(null);
      return null;
    }
    setLoading(true);
    try {
      const next = await listDepartments();
      setSnapshot(next);
      return next;
    } finally {
      setLoading(false);
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