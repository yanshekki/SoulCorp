import { confirm as tauriConfirm, message as tauriMessage } from "@tauri-apps/plugin-dialog";

/**
 * Native confirm dialog (Ok / Cancel).
 *
 * Prefer this over `window.confirm`: Tauri's dialog plugin injects an async
 * `window.confirm` that still calls the removed `plugin:dialog|confirm` IPC,
 * which rejects with "dialog.confirm not allowed. Command not found".
 */
export async function confirmDialog(
  text: string,
  options?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<boolean> {
  try {
    return await tauriConfirm(text, {
      title: options?.title ?? "SoulCorp",
      kind: options?.kind ?? "warning",
    });
  } catch (error) {
    console.error("[nativeDialog] confirm failed:", error);
    // Fail closed: do not proceed with destructive actions if dialog breaks.
    return false;
  }
}

/** Native alert / message dialog. */
export async function alertDialog(
  text: string,
  options?: { title?: string; kind?: "info" | "warning" | "error" },
): Promise<void> {
  try {
    await tauriMessage(text, {
      title: options?.title ?? "SoulCorp",
      kind: options?.kind ?? "info",
    });
  } catch (error) {
    console.error("[nativeDialog] alert failed:", error);
  }
}

/**
 * Re-patch browser dialogs so any leftover `window.confirm` / `window.alert`
 * use the working `plugin:dialog|message` command (OkCancel / Ok).
 *
 * Safe to call multiple times. Install as early as possible on app boot.
 */
export function installNativeDialogPolyfill(): void {
  if (typeof window === "undefined") {
    return;
  }

  // Tauri injects broken async confirm → plugin:dialog|confirm (removed in 2.x).
  // @ts-expect-error — window.confirm is typed sync; runtime is async under Tauri.
  window.confirm = async (message?: string) => {
    try {
      return await confirmDialog(String(message ?? ""));
    } catch {
      return false;
    }
  };

  window.alert = (message?: string) => {
    void alertDialog(String(message ?? "")).catch(() => {
      // ignore — alert must not throw into callers
    });
  };
}
