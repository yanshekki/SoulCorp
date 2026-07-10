import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { getAutopilotSnapshot, type AutopilotSnapshot } from "../services/autopilotClient";

const POLL_MS = 12_000;

/**
 * Soft-refresh autopilot snapshot.
 * Never blanks the UI on poll / scrumRevision ticks — only updates values in place.
 */
export function useAutopilotSnapshot() {
  const activeCompanyId = useGameStore((s) => s.activeCompanyId);
  const scrumRevision = useGameStore((s) => s.scrumRevision);
  const [snapshot, setSnapshot] = useState<AutopilotSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const next = await getAutopilotSnapshot();
      if (generation !== loadGenerationRef.current) {
        return null;
      }
      hasSnapshotRef.current = true;
      setSnapshot(next);
      setError(null);
      return next;
    } catch (err) {
      if (generation === loadGenerationRef.current) {
        setError(String(err));
      }
      return null;
    } finally {
      if (generation === loadGenerationRef.current && showLoading) {
        setLoading(false);
      }
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void refresh();
  }, [refresh, scrumRevision]);

  useEffect(() => {
    if (!activeCompanyId) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeCompanyId, refresh]);

  return { snapshot, loading, error, refresh };
}
