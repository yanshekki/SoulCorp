#!/usr/bin/env node
/**
 * Converts furniture PNG textures to KTX2 (ETC1S) and patches GLTF to KHR_texture_basisu.
 * Requires KTX-Software toktx on PATH or scripts/.vendor/KTX-Software-.../bin/toktx.
 *
 * Run: node scripts/compress-furniture-ktx2.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FURNITURE_DIR = join(ROOT, "public/assets/furniture");
const TEX_DIR = join(FURNITURE_DIR, "textures");

function resolveToktx() {
  const vendorGlob = join(__dirname, ".vendor");
  if (existsSync(vendorGlob)) {
    for (const entry of readdirSync(vendorGlob)) {
      const candidate = join(vendorGlob, entry, "bin", "toktx");
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  const which = spawnSync("which", ["toktx"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }
  return null;
}

function convertPngToKtx2(toktx, pngPath, ktx2Path) {
  const result = spawnSync(
    toktx,
    ["--t2", "--bcmp", "--genmipmap", ktx2Path, pngPath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`toktx failed for ${pngPath}: ${result.stderr || result.stdout}`);
  }
}

function patchGltfForKtx2(gltfPath) {
  const gltf = JSON.parse(readFileSync(gltfPath, "utf8"));
  if (!Array.isArray(gltf.images) || gltf.images.length === 0) {
    return false;
  }

  let changed = false;
  for (const image of gltf.images) {
    if (!image.uri || !image.uri.endsWith(".png")) {
      continue;
    }
    const base = image.uri.replace(/^textures\//, "").replace(/\.png$/, "");
    image.uri = `textures/${base}.ktx2`;
    image.mimeType = "image/ktx2";
    changed = true;
  }

  if (!changed) {
    return false;
  }

  if (Array.isArray(gltf.textures)) {
    gltf.textures = gltf.textures.map((texture, index) => ({
      ...texture,
      extensions: {
        KHR_texture_basisu: { source: texture.source ?? index },
      },
    }));
  }

  const extensionsUsed = new Set(gltf.extensionsUsed ?? []);
  extensionsUsed.add("KHR_texture_basisu");
  gltf.extensionsUsed = [...extensionsUsed];

  const extensionsRequired = new Set(gltf.extensionsRequired ?? []);
  extensionsRequired.add("KHR_texture_basisu");
  gltf.extensionsRequired = [...extensionsRequired];

  writeFileSync(gltfPath, `${JSON.stringify(gltf, null, 2)}\n`);
  return true;
}

const toktx = resolveToktx();
if (!toktx) {
  console.error(
    "toktx not found. Install KTX-Software or extract to scripts/.vendor/KTX-Software-*/bin/toktx",
  );
  process.exit(1);
}

const pngFiles = readdirSync(TEX_DIR).filter((name) => name.endsWith(".png"));
let ktxCount = 0;
for (const png of pngFiles) {
  const pngPath = join(TEX_DIR, png);
  const ktx2Path = join(TEX_DIR, png.replace(/\.png$/, ".ktx2"));
  convertPngToKtx2(toktx, pngPath, ktx2Path);
  ktxCount += 1;
  console.log(`  ${png} → ${png.replace(/\.png$/, ".ktx2")}`);
}

const gltfFiles = readdirSync(FURNITURE_DIR).filter((name) => name.endsWith(".gltf"));
let patched = 0;
for (const file of gltfFiles) {
  if (patchGltfForKtx2(join(FURNITURE_DIR, file))) {
    patched += 1;
  }
}

console.log(`\nKTX2 pipeline: ${ktxCount} textures, ${patched} GLTF patched.`);