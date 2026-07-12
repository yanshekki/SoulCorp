import { appendAppLog } from "../services/logsClient";
import type { LogCategory, LogLevel } from "../types/appLog";
import { useGameStore } from "../stores/gameStore";

/** Vite HMR / hot-reload noise during `pnpm dev` — not real app failures. */
export function isDevHmrNoise(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("importing a module script failed") ||
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("error loading dynamically imported module") ||
    m.includes("concurrent rendering but react was able to recover") ||
    m.includes("loading css chunk") ||
    m.includes("loading chunk") ||
    m.includes("module script failed") ||
    // WebKit/Vite transient during rebuild
    (m.includes("failed to fetch") && m.includes("module"))
  );
}

/** Expected user/business outcomes — show in UI, don't flood Logs as Error. */
export function isExpectedBusinessMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not at the head of the agent's queue") ||
    m.includes("execution queue is paused") ||
    m.includes("assign an agent before") ||
    m.includes("already completed or awaiting review") ||
    m.includes("insufficient token") ||
    m.includes("not enough tokens") ||
    m.includes("company not loaded") ||
    m.includes("create a company before")
  );
}

/** Best-effort client log — never throws to callers. */
export async function logClientError(
  category: LogCategory | string,
  source: string,
  message: string,
  detail?: string,
): Promise<void> {
  if (isDevHmrNoise(message)) {
    return;
  }
  const level: LogLevel = isExpectedBusinessMessage(message) ? "warn" : "error";
  return logClient(level, category, source, message, detail);
}

export async function logClient(
  level: LogLevel,
  category: LogCategory | string,
  source: string,
  message: string,
  detail?: string,
): Promise<void> {
  try {
    if (level === "error" && isDevHmrNoise(message)) {
      return;
    }
    const companyId = useGameStore.getState().activeCompanyId;
    await appendAppLog({
      level,
      category,
      source,
      message,
      detail: detail ?? null,
      company_id: companyId || null,
    });
  } catch {
    // ignore — logger must not break UI
  }
}

export function installGlobalErrorLogging(): () => void {
  const onError = (event: ErrorEvent) => {
    const message = event.message || "Unhandled window error";
    if (isDevHmrNoise(message)) {
      return;
    }
    void logClientError(
      "ui",
      "window.error",
      message,
      event.error?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`,
    );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    if (isDevHmrNoise(message)) {
      return;
    }
    const detail = reason instanceof Error ? reason.stack ?? null : String(reason);
    void logClientError("ui", "unhandledrejection", message, detail ?? undefined);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
