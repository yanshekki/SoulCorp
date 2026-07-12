import { rawInvoke } from "../utils/tauriInvoke";
import type {
  AppLogPage,
  AppLogQuery,
  AppLogStats,
  LogCategory,
  LogLevel,
} from "../types/appLog";

/** Logging commands use rawInvoke to avoid recursive auto-log on failure. */

export async function listAppLogs(query: AppLogQuery = {}): Promise<AppLogPage> {
  return rawInvoke<AppLogPage>("list_app_logs", { query });
}

export async function getAppLogStats(): Promise<AppLogStats> {
  return rawInvoke<AppLogStats>("get_app_log_stats");
}

export async function clearAppLogs(options?: {
  level?: string | null;
  category?: string | null;
}): Promise<number> {
  return rawInvoke<number>("clear_app_logs", {
    level: options?.level ?? null,
    category: options?.category ?? null,
  });
}

export async function appendAppLog(entry: {
  level: LogLevel | string;
  category: LogCategory | string;
  source: string;
  message: string;
  detail?: string | null;
  company_id?: string | null;
}): Promise<void> {
  await rawInvoke("append_app_log", { entry });
}

/** Export matching logs to a JSON file under app data /exports. Returns absolute path. */
export async function exportAppLogs(query: AppLogQuery = {}): Promise<string> {
  return rawInvoke<string>("export_app_logs", { query });
}
