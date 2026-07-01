/** Phase 3 — static interior screenshot export. */

export function interiorScreenshotFilename(buildingId: string, timestamp = Date.now()): string {
  const slug = buildingId.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "office";
  return `soulcorp-office-${slug}-${timestamp}.png`;
}

export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function downloadPngDataUrl(dataUrl: string, filename: string): void {
  if (!dataUrl.startsWith("data:image/png")) {
    return;
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.rel = "noopener";
  link.click();
}