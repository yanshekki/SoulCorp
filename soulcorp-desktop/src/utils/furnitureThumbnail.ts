import { catalogEntryIcon, getCatalogEntry } from "../data/furnitureCatalog";

const runtimeCache = new Map<string, string>();
const STATIC_THUMB_BASE = "/assets/furniture/thumbs";

export function furnitureThumbnailPath(catalogId: string): string {
  return `${STATIC_THUMB_BASE}/${catalogId}.svg`;
}

function drawRuntimeThumbnail(catalogId: string, accent: string): string {
  const entry = getCatalogEntry(catalogId);
  const icon = entry ? catalogEntryIcon(entry) : "📦";
  const label = entry?.label ?? catalogId;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }

  const gradient = ctx.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, "#1a2744");
  gradient.addColorStop(1, "#243652");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(4, 4, 56, 56, 10);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = "26px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, 32, 30);

  ctx.fillStyle = "rgba(244, 248, 255, 0.88)";
  ctx.font = "bold 8px system-ui";
  const shortLabel = label.length > 10 ? `${label.slice(0, 9)}…` : label;
  ctx.fillText(shortLabel, 32, 52);

  return canvas.toDataURL("image/png");
}

export function getFurnitureThumbnailUrl(catalogId: string, accent = "#5ec8ff"): string {
  const cacheKey = `${catalogId}:${accent}`;
  const cached = runtimeCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const url = drawRuntimeThumbnail(catalogId, accent);
  if (url) {
    runtimeCache.set(cacheKey, url);
  }
  return url;
}