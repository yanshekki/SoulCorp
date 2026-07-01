#!/usr/bin/env node
/**
 * Phase 6 acceptance runner: unit tests + typecheck + Rust lib tests.
 * Usage: pnpm acceptance
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", encoding: "utf8" });
  return result.status ?? 1;
}

const requiredFiles = [
  "src/audio/AudioDirector.ts",
  "src/components/world/roomShellBuilder.ts",
  "src/components/world/gltfAssetLoader.ts",
  "src/components/world/furnitureRenderer.ts",
  "src/components/design/OfficeFloorPlanEditor.tsx",
  "src/components/world/BuildModeHud.tsx",
  "src/components/world/FallbackFloorPlan.tsx",
  "src/acceptance/gameDesignChecklist.ts",
  "src/data/furnitureCatalog.ts",
  "src/utils/furnitureInteractions.ts",
  "src/components/world/FurnitureDetailPanel.tsx",
];

console.log("=== SoulCorp Phase 6 Acceptance ===\n");

let failed = 0;

console.log("1/4 Required implementation files");
for (const file of requiredFiles) {
  const path = join(root, file);
  if (!existsSync(path)) {
    console.error(`  MISSING: ${file}`);
    failed += 1;
  }
}
if (failed === 0) {
  console.log(`  OK — ${requiredFiles.length} files present\n`);
} else {
  console.log("");
}

console.log("2/4 TypeScript unit tests");
const testStatus = run("pnpm", ["exec", "tsx", "scripts/run-acceptance-tests.ts"]);
if (testStatus !== 0) {
  failed += 1;
}
console.log("");

console.log("2b/4 Furniture GLTF assets on disk");
const furnitureDir = join(root, "public/assets/furniture");
const gltfFiles = existsSync(furnitureDir)
  ? readdirSync(furnitureDir).filter((name) => name.endsWith(".gltf"))
  : [];
const hasFloorLamp = gltfFiles.includes("floor_lamp.gltf");
if (gltfFiles.length < 21 || !hasFloorLamp) {
  console.error(`  MISSING GLTF assets (count=${gltfFiles.length}, floor_lamp=${hasFloorLamp})`);
  failed += 1;
} else {
  console.log(`  OK — ${gltfFiles.length} GLTF files including floor_lamp\n`);
}

console.log("3/4 pnpm typecheck");
const tsStatus = run("pnpm", ["typecheck"]);
if (tsStatus !== 0) {
  failed += 1;
}
console.log("");

console.log("4/4 cargo test --lib");
const rustStatus = run("cargo", ["test", "--lib"], join(root, "src-tauri"));
if (rustStatus !== 0) {
  failed += 1;
}
console.log("");

if (failed > 0) {
  console.error(`Acceptance FAILED (${failed} stage(s))`);
  process.exit(1);
}

console.log("Acceptance PASSED — all stages green.");