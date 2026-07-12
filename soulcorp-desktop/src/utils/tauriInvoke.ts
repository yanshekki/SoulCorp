/**
 * App-wide Tauri invoke wrapper.
 *
 * Every failed backend command is written to app_logs so the Logs page can show
 * errors from any screen — not only places that call logClientError by hand.
 *
 * Use this instead of importing invoke from @tauri-apps/api/core.
 * Logging itself uses rawInvoke to avoid recursive log failures.
 */
import { invoke as rawInvoke } from "@tauri-apps/api/core";
import type { LogCategory } from "../types/appLog";
import { isDevHmrNoise, isExpectedBusinessMessage, logClient, logClientError } from "./appLog";

/** Commands that must not auto-log (logging / poll noise / expected empty states). */
const SILENT_COMMANDS = new Set([
  "append_app_log",
  "list_app_logs",
  "get_app_log_stats",
  "clear_app_logs",
]);

/** Recent (source+message) keys to suppress duplicate spam within a short window. */
const recentKeys = new Map<string, number>();
const DEDUPE_MS = 2500;

function categoryForCommand(cmd: string): LogCategory {
  const c = cmd.toLowerCase();
  if (c.includes("meeting")) return "meeting";
  if (c.includes("scrum") || c.includes("work_node") || c.includes("sprint") || c.includes("backlog")) {
    return "execution";
  }
  if (c.includes("worker") || c.includes("autopilot")) return "worker";
  if (
    c.includes("chat") ||
    c.includes("llm") ||
    c.includes("ai_") ||
    c.includes("provider") ||
    c.includes("ollama") ||
    c.includes("openai")
  ) {
    return "ai";
  }
  if (c.includes("hub") || c.includes("gig") || c.includes("contract")) return "hub";
  if (
    c.includes("workspace") ||
    c.includes("page") ||
    c.includes("folder") ||
    c.includes("file") ||
    c.includes("document")
  ) {
    return "workspace";
  }
  if (c.includes("setting") || c.includes("game_settings") || c.includes("audio")) {
    return "settings";
  }
  if (c.includes("token") || c.includes("finance") || c.includes("wallet") || c.includes("stake")) {
    return "finance";
  }
  return "system";
}

function shouldLog(cmd: string, message: string): boolean {
  if (SILENT_COMMANDS.has(cmd)) {
    return false;
  }
  const key = `${cmd}::${message}`;
  const now = Date.now();
  const prev = recentKeys.get(key);
  if (prev != null && now - prev < DEDUPE_MS) {
    return false;
  }
  recentKeys.set(key, now);
  // Opportunistic prune
  if (recentKeys.size > 200) {
    for (const [k, t] of recentKeys) {
      if (now - t > DEDUPE_MS) {
        recentKeys.delete(k);
      }
    }
  }
  return true;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Drop-in replacement for `@tauri-apps/api/core` invoke with automatic error logging.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    // Tauri accepts plain objects; cast keeps call sites simple.
    return await rawInvoke<T>(cmd, args as never);
  } catch (error) {
    const message = errorMessage(error);
    if (shouldLog(cmd, message) && !isDevHmrNoise(message)) {
      const detail = error instanceof Error ? error.stack ?? undefined : undefined;
      if (isExpectedBusinessMessage(message)) {
        // Queue order, paused execution, missing assignee — user-facing, not a crash.
        void logClient("warn", categoryForCommand(cmd), `invoke:${cmd}`, message, detail);
      } else {
        void logClientError(categoryForCommand(cmd), `invoke:${cmd}`, message, detail);
      }
    }
    throw error;
  }
}

/** Raw invoke without logging — for the logger itself and special cases. */
export { rawInvoke };
