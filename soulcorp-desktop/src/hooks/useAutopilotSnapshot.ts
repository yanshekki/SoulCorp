import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { getAutopilotSnapshot, type AutopilotSnapshot } from "../services/autopilotClient";

const POLL_MS = 12_000;

export function useAutopilotSnapshot() {
  const activeCompanyId = useGameStore((s) => s.activeCompanyId);
  const scrumRevision = useGameStore((s) => s.scrumRevision);
  const [snapshot, setSnapshot] = useState<AutopilotSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeCompanyId) {
      setSnapshot(null);
      return null;
    }
    setLoading(true);
    try {
      const next = await getAutopilotSnapshot();
      setSnapshot(next);
      setError(null);
      return next;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setLoading(false);
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