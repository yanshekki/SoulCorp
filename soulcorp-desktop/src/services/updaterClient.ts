import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateProgress {
  downloaded: number;
  contentLength: number | null;
  phase: "idle" | "checking" | "downloading" | "installing" | "done" | "error";
  message: string;
}

export async function checkForAppUpdate(): Promise<Update | null> {
  return check();
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | null = null;

  onProgress?.({
    downloaded: 0,
    contentLength: null,
    phase: "downloading",
    message: "Downloading update…",
  });

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        onProgress?.({
          downloaded: 0,
          contentLength,
          phase: "downloading",
          message: "Download started…",
        });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({
          downloaded,
          contentLength,
          phase: "downloading",
          message:
            contentLength != null
              ? `Downloading… ${Math.min(100, Math.round((downloaded / contentLength) * 100))}%`
              : "Downloading…",
        });
        break;
      case "Finished":
        onProgress?.({
          downloaded,
          contentLength,
          phase: "installing",
          message: "Installing update…",
        });
        break;
      default:
        break;
    }
  });

  onProgress?.({
    downloaded,
    contentLength,
    phase: "done",
    message: "Update installed. Restarting…",
  });
  await relaunch();
}