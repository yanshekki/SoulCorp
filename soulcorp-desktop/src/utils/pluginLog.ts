/**
 * Wrappers for Tauri plugin APIs that do not go through our invoke() logger.
 * Failures are written to app_logs with category + source.
 */
import { open as dialogOpen, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import { check as updaterCheck, type Update } from "@tauri-apps/plugin-updater";
import { logClientError } from "./appLog";

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

/** File/folder open dialog with auto error logging. */
export async function openLogged(
  options?: OpenDialogOptions,
): Promise<string | string[] | null> {
  try {
    return await dialogOpen(options);
  } catch (error) {
    void logClientError(
      "system",
      "plugin:dialog|open",
      errorMessage(error),
      error instanceof Error ? error.stack ?? undefined : undefined,
    );
    throw error;
  }
}

/** Updater check with auto error logging. */
export async function checkUpdateLogged(): Promise<Update | null> {
  try {
    return await updaterCheck();
  } catch (error) {
    void logClientError(
      "system",
      "plugin:updater|check",
      errorMessage(error),
      error instanceof Error ? error.stack ?? undefined : undefined,
    );
    throw error;
  }
}
