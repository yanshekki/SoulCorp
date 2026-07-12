import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { checkUpdateLogged } from "../utils/pluginLog";
import { languageFromSettings, translate } from "../i18n";
import { useGameStore } from "../stores/gameStore";

function tUpdate(key: string, params?: Record<string, string | number>): string {
  const language = languageFromSettings(useGameStore.getState().settings);
  return translate(language, key, params);
}

export interface UpdateProgress {
  downloaded: number;
  contentLength: number | null;
  phase: "idle" | "checking" | "downloading" | "installing" | "done" | "error";
  message: string;
}

export async function checkForAppUpdate(): Promise<Update | null> {
  return checkUpdateLogged();
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
    message: tUpdate("update.downloading"),
  });

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? null;
        onProgress?.({
          downloaded: 0,
          contentLength,
          phase: "downloading",
          message: tUpdate("update.downloadStarted"),
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
              ? tUpdate("update.downloadingPct", {
                  pct: Math.min(100, Math.round((downloaded / contentLength) * 100)),
                })
              : tUpdate("update.downloadingSimple"),
        });
        break;
      case "Finished":
        onProgress?.({
          downloaded,
          contentLength,
          phase: "installing",
          message: tUpdate("update.installing"),
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
    message: tUpdate("update.installedRestarting"),
  });
  await relaunch();
}