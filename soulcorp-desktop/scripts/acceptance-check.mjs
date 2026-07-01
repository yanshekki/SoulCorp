#!/usr/bin/env node
/**
 * Phase 6 acceptance runner: unit tests + typecheck + Rust lib tests.
 * Usage: pnpm acceptance
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  // Phase 1 office visual tracks (A1–C2)
  "src/components/design/DesignStudioPage.tsx",
  "src/utils/placementEngine.ts",
  "src/components/design/InteriorDesignViewport.tsx",
  "src/components/design/OfficeBuildToolbar.tsx",
  "src/components/design/OfficeInspectorPanel.tsx",
  "src/components/design/FurniturePlanSilhouette.tsx",
  "src/utils/furniturePlanSilhouette.ts",
  "scripts/lib/gltfBuilder.mjs",
  "src/utils/roomKitTextures.ts",
  "src/utils/studioPostPipeline.ts",
  "src/acceptance/placementParity.ts",
  "src/utils/furnitureSceneDiff.ts",
  "src/acceptance/phase1Acceptance.ts",
  "src/acceptance/phase1FeelReview.ts",
  "docs/OFFICE_VISUAL_TARGET.md",
];

console.log("=== SoulCorp Phase 6 + Phase 1 Office Visual Acceptance ===\n");

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

console.log("2/4 TypeScript unit tests (incl. Phase 1 gate)");
const testStatus = run("pnpm", ["exec", "tsx", "scripts/run-acceptance-tests.ts"]);
if (testStatus !== 0) {
  failed += 1;
}
console.log("");

console.log("2b/4 Furniture GLTF assets on disk (B2 core + catalog)");
const furnitureDir = join(root, "public/assets/furniture");
const texDir = join(furnitureDir, "textures");
const gltfFiles = existsSync(furnitureDir)
  ? readdirSync(furnitureDir).filter((name) => name.endsWith(".gltf"))
  : [];
const coreB2 = [
  "desk_open",
  "chair_office",
  "sofa",
  "plant_ficus",
  "monitor",
  "reception_desk",
  "whiteboard",
  "floor_lamp",
];
const coreOk = coreB2.every((id) => {
  const gltfPath = join(furnitureDir, `${id}.gltf`);
  const binPath = join(furnitureDir, `${id}.bin`);
  if (!existsSync(gltfPath) || !existsSync(binPath)) {
    return false;
  }
  const gltf = JSON.parse(readFileSync(gltfPath, "utf8"));
  return (
    gltf.materials?.length > 0 &&
    gltf.images?.length > 0 &&
    gltf.meshes?.length > 1 &&
    gltf.asset?.generator?.includes("b2")
  );
});
const texOk =
  existsSync(texDir) &&
  ["wood.png", "fabric.png", "metal.png", "screen.png", "accent.png"].every((name) =>
    existsSync(join(texDir, name)),
  );
if (gltfFiles.length < 21 || !coreOk || !texOk) {
  console.error(
    `  MISSING B2 assets (gltf=${gltfFiles.length}, coreOk=${coreOk}, texOk=${texOk})`,
  );
  failed += 1;
} else {
  console.log(`  OK — ${gltfFiles.length} GLTF + 8 core B2 textured assets\n`);
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