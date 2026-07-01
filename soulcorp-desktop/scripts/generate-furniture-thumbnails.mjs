import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public/assets/furniture/thumbs");

const ENTRIES = [
  ["desk_open", "Open desk", "🗄"],
  ["desk_cubicle", "Cubicle desk", "🗄"],
  ["desk_executive", "Executive desk", "🗄"],
  ["desk_creative", "Creative desk", "🗄"],
  ["desk_lounge", "Lounge desk", "🗄"],
  ["reception_desk", "Reception desk", "🗄"],
  ["chair_office", "Office chair", "💺"],
  ["chair_executive", "Executive chair", "💺"],
  ["sofa", "Sofa", "🛋"],
  ["sofa_corner", "Corner sofa", "🛋"],
  ["plant_ficus", "Ficus plant", "🪴"],
  ["plant_potted", "Potted plant", "🪴"],
  ["monitor", "Monitor", "🖥"],
  ["laptop", "Laptop", "🖥"],
  ["server_rack", "Server rack", "🖥"],
  ["bookshelf", "Bookshelf", "📦"],
  ["whiteboard", "Whiteboard", "🛋"],
  ["coffee_table", "Coffee table", "🛋"],
  ["filing_cabinet", "Filing cabinet", "📦"],
  ["water_cooler", "Water cooler", "🛋"],
  ["floor_lamp", "Floor lamp", "💡"],
  ["wall_poster", "Startup poster", "🖼"],
  ["wall_canvas", "Abstract canvas", "🎨"],
  ["rug_runner", "Runner rug", "🧶"],
  ["rug_round", "Round rug", "⭕"],
];

function svgFor(id, label, icon) {
  const short = label.length > 11 ? `${label.slice(0, 10)}…` : label;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a2744"/>
      <stop offset="100%" stop-color="#243652"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="10" fill="url(#bg)" stroke="#5ec8ff" stroke-opacity="0.55" stroke-width="2"/>
  <text x="32" y="34" text-anchor="middle" font-size="24">${icon}</text>
  <text x="32" y="54" text-anchor="middle" fill="#f4f8ff" font-family="system-ui, sans-serif" font-size="7" font-weight="700">${short}</text>
</svg>
`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const [id, label, icon] of ENTRIES) {
  fs.writeFileSync(path.join(outDir, `${id}.svg`), svgFor(id, label, icon), "utf8");
}
console.log(`Generated ${ENTRIES.length} furniture thumbnails in ${outDir}`);