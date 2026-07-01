#!/usr/bin/env node
/**
 * Imports Blender-exported GLB/GLTF drops into public/assets/furniture/blender/.
 * Drop files as blender/exports/<catalog_id>.glb then run this script.
 *
 * Run: node scripts/import-blender-gltf.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DROP_DIR = join(ROOT, "blender/exports");
const OUT_DIR = join(ROOT, "public/assets/furniture/blender");
const CATALOG_PATH = join(ROOT, "src/data/furnitureCatalog.ts");

mkdirSync(DROP_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const drops = readdirSync(DROP_DIR).filter((name) => /\.(glb|gltf)$/i.test(name));
if (drops.length === 0) {
  console.log("No Blender exports in blender/exports/ — drop <catalog_id>.glb files there first.");
  process.exit(0);
}

const imported = [];
for (const file of drops) {
  const catalogId = file.replace(/\.(glb|gltf)$/i, "");
  const ext = file.endsWith(".gltf") ? "gltf" : "glb";
  const dest = join(OUT_DIR, `${catalogId}.${ext}`);
  copyFileSync(join(DROP_DIR, file), dest);
  imported.push({ catalogId, ext, publicPath: `/assets/furniture/blender/${catalogId}.${ext}` });
  console.log(`  imported ${file} → public/assets/furniture/blender/${catalogId}.${ext}`);
}

let catalog = readFileSync(CATALOG_PATH, "utf8");
for (const { catalogId, publicPath } of imported) {
  const idPattern = new RegExp(`id:\\s*"${catalogId}"[\\s\\S]*?gltfPath:\\s*"[^"]+"`, "m");
  if (!idPattern.test(catalog)) {
    console.warn(`  skip catalog hook — unknown id: ${catalogId}`);
    continue;
  }
  if (catalog.includes(`id: "${catalogId}"`) && catalog.includes(`blenderGltfPath: "${publicPath}"`)) {
    continue;
  }
  catalog = catalog.replace(
    new RegExp(`(id:\\s*"${catalogId}"[\\s\\S]*?gltfPath:\\s*"[^"]+")`, "m"),
    `$1,\n    blenderGltfPath: "${publicPath}"`,
  );
}

writeFileSync(CATALOG_PATH, catalog);
console.log(`\nImported ${imported.length} Blender asset(s); catalog overrides patched where ids match.`);