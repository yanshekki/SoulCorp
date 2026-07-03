import { useGameStore } from "../stores/gameStore";

/** Subscribe to active company identity and global reload revision. */
export function useCompanyScope() {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const companyRevision = useGameStore((state) => state.companyRevision);
  return { activeCompanyId, companyRevision };
}