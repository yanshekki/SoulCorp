/**
 * Generates stylized low-poly GLTF 2.0 furniture with PBR textures for SoulCorp.
 * Phase B2: 8 core assets with material slots (wood/fabric/metal/screen/accent).
 * Run: node scripts/generate-furniture-gltf.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateFurnitureTextures } from "./lib/furnitureTextureGen.mjs";
import {
  GltfBuilder,
  coreAssetDefinitions,
  secondaryAssetDefinitions,
  CORE_FURNITURE_IDS,
} from "./lib/gltfBuilder.mjs";

const DECOR_ASSET_IDS = ["wall_poster", "wall_canvas", "rug_runner", "rug_round"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/assets/furniture");
const TEX_DIR = join(OUT_DIR, "textures");

mkdirSync(OUT_DIR, { recursive: true });

console.log("Generating furniture textures…");
const texturePaths = generateFurnitureTextures(TEX_DIR);

const allDefs = { ...coreAssetDefinitions(), ...secondaryAssetDefinitions() };

let coreCount = 0;
for (const [id, buildFn] of Object.entries(allDefs)) {
  const builder = new GltfBuilder(texturePaths);
  buildFn(builder);
  const { gltf, bin } = builder.build(id);
  writeFileSync(join(OUT_DIR, `${id}.gltf`), JSON.stringify(gltf, null, 2));
  writeFileSync(join(OUT_DIR, `${id}.bin`), bin);
  if (CORE_FURNITURE_IDS.includes(id)) {
    coreCount += 1;
  }
  console.log(`  ${id}.gltf + .bin (${builder.parts.length} parts)`);
}

const decorCount = DECOR_ASSET_IDS.filter((id) => id in allDefs).length;
console.log(
  `\nGenerated ${Object.keys(allDefs).length} furniture GLTF assets (${coreCount} core B2, ${decorCount} decor).`,
);