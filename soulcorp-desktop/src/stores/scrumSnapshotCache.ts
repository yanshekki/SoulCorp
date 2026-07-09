import type { ScrumSnapshot } from "../types/game";

let cachedSnapshot: ScrumSnapshot | null = null;
let cachedCompanyId: string | null = null;

export function getCachedScrumSnapshot(companyId: string): ScrumSnapshot | null {
  if (cachedCompanyId === companyId && cachedSnapshot) {
    return cachedSnapshot;
  }
  return null;
}

export function setCachedScrumSnapshot(companyId: string, snapshot: ScrumSnapshot): void {
  cachedCompanyId = companyId;
  cachedSnapshot = snapshot;
}

export function clearScrumSnapshotCache(): void {
  cachedCompanyId = null;
  cachedSnapshot = null;
}