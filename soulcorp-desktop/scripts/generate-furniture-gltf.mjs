/**
 * Generates stylized low-poly GLTF 2.0 furniture for SoulCorp interior pipeline.
 * Run: node scripts/generate-furniture-gltf.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/assets/furniture");

mkdirSync(OUT_DIR, { recursive: true });

/** @typedef {{ w: number, h: number, d: number, x?: number, y?: number, z?: number, color?: [number, number, number] }} Part */

/**
 * @param {Part[]} parts
 * @param {string} name
 */
function buildGltf(parts, name) {
  const vertices = [];
  const indices = [];
  const colors = [];
  let indexOffset = 0;

  for (const part of parts) {
    const { w, h, d } = part;
    const px = part.x ?? 0;
    const py = part.y ?? h / 2;
    const pz = part.z ?? 0;
    const [cr, cg, cb] = part.color ?? [0.75, 0.72, 0.68];
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;

    const corners = [
      [-hw, -hh, -hd],
      [hw, -hh, -hd],
      [hw, hh, -hd],
      [-hw, hh, -hd],
      [-hw, -hh, hd],
      [hw, -hh, hd],
      [hw, hh, hd],
      [-hw, hh, hd],
    ].map(([x, y, z]) => [x + px, y + py, z + pz]);

    const base = indexOffset;
    for (const c of corners) {
      vertices.push(...c);
      colors.push(cr, cg, cb);
    }

    const faces = [
      [0, 1, 2, 0, 2, 3],
      [4, 6, 5, 4, 7, 6],
      [0, 4, 5, 0, 5, 1],
      [2, 6, 7, 2, 7, 3],
      [0, 3, 7, 0, 7, 4],
      [1, 5, 6, 1, 6, 2],
    ];
    for (const face of faces) {
      for (const idx of face) {
        indices.push(base + idx);
      }
    }
    indexOffset += 8;
  }

  const vertBytes = new Float32Array(vertices);
  const colorBytes = new Float32Array(colors);
  const idxBytes = new Uint16Array(indices);
  const buffer = Buffer.concat([
    Buffer.from(vertBytes.buffer),
    Buffer.from(colorBytes.buffer),
    Buffer.from(idxBytes.buffer),
  ]);

  const blob = buffer.toString("base64");
  const vertLen = vertBytes.byteLength;
  const colorLen = colorBytes.byteLength;
  const idxLen = idxBytes.byteLength;

  const gltf = {
    asset: { version: "2.0", generator: "soulcorp-furniture-gen" },
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [
      {
        name,
        primitives: [
          {
            attributes: { POSITION: 0, COLOR_0: 1 },
            indices: 2,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertices.length / 3,
        type: "VEC3",
        max: [Math.max(...vertices.filter((_, i) => i % 3 === 0)), 2, 2],
        min: [Math.min(...vertices.filter((_, i) => i % 3 === 0)), 0, -2],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: colors.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vertLen },
      { buffer: 0, byteOffset: vertLen, byteLength: colorLen },
      { buffer: 0, byteOffset: vertLen + colorLen, byteLength: idxLen },
    ],
    buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${blob}` }],
  };

  return JSON.stringify(gltf, null, 2);
}

function deskParts(topColor, legColor) {
  return [
    { w: 1.2, h: 0.06, d: 0.75, y: 0.72, color: topColor },
    { w: 0.08, h: 0.7, d: 0.08, x: -0.5, y: 0.35, z: -0.28, color: legColor },
    { w: 0.08, h: 0.7, d: 0.08, x: 0.5, y: 0.35, z: -0.28, color: legColor },
    { w: 0.08, h: 0.7, d: 0.08, x: -0.5, y: 0.35, z: 0.28, color: legColor },
    { w: 0.08, h: 0.7, d: 0.08, x: 0.5, y: 0.35, z: 0.28, color: legColor },
  ];
}

const CATALOG = {
  desk_open: deskParts([0.83, 0.78, 0.7], [0.45, 0.42, 0.38]),
  desk_cubicle: [
    { w: 1.1, h: 0.05, d: 0.9, y: 0.7, color: [0.78, 0.82, 0.88] },
    { w: 1.1, h: 0.5, d: 0.05, x: 0, y: 0.45, z: 0.42, color: [0.7, 0.75, 0.82] },
    ...deskParts([0.78, 0.82, 0.88], [0.5, 0.52, 0.58]).slice(1),
  ],
  desk_executive: [
    { w: 1.45, h: 0.07, d: 0.82, y: 0.74, color: [0.36, 0.29, 0.22] },
    { w: 0.5, h: 0.65, d: 0.45, y: 0.36, color: [0.3, 0.24, 0.18] },
  ],
  desk_creative: [
    { w: 1.3, h: 0.05, d: 1.0, y: 0.68, color: [0.9, 0.55, 0.45] },
    ...deskParts([0.9, 0.55, 0.45], [0.4, 0.4, 0.45]).slice(1),
  ],
  desk_lounge: [
    { w: 1.0, h: 0.04, d: 1.1, y: 0.55, color: [0.6, 0.55, 0.48] },
    { w: 0.9, h: 0.45, d: 0.35, x: 0, y: 0.22, z: 0.35, color: [0.55, 0.5, 0.44] },
  ],
  reception_desk: [
    { w: 1.6, h: 0.08, d: 0.7, y: 0.55, color: [0.35, 0.4, 0.48] },
    { w: 1.4, h: 0.9, d: 0.12, x: 0, y: 0.45, z: 0.35, color: [0.42, 0.48, 0.55] },
    { w: 0.1, h: 0.5, d: 0.1, x: -0.7, y: 0.25, z: -0.25, color: [0.3, 0.32, 0.38] },
    { w: 0.1, h: 0.5, d: 0.1, x: 0.7, y: 0.25, z: -0.25, color: [0.3, 0.32, 0.38] },
  ],
  chair_office: [
    { w: 0.45, h: 0.06, d: 0.45, y: 0.48, color: [0.25, 0.28, 0.35] },
    { w: 0.42, h: 0.5, d: 0.06, y: 0.72, z: -0.18, color: [0.28, 0.32, 0.4] },
    { w: 0.06, h: 0.48, d: 0.06, x: -0.16, y: 0.24, z: -0.16, color: [0.2, 0.2, 0.22] },
    { w: 0.06, h: 0.48, d: 0.06, x: 0.16, y: 0.24, z: -0.16, color: [0.2, 0.2, 0.22] },
    { w: 0.06, h: 0.48, d: 0.06, x: -0.16, y: 0.24, z: 0.16, color: [0.2, 0.2, 0.22] },
    { w: 0.06, h: 0.48, d: 0.06, x: 0.16, y: 0.24, z: 0.16, color: [0.2, 0.2, 0.22] },
  ],
  chair_executive: [
    { w: 0.55, h: 0.08, d: 0.55, y: 0.5, color: [0.15, 0.12, 0.1] },
    { w: 0.5, h: 0.65, d: 0.08, y: 0.8, z: -0.2, color: [0.12, 0.1, 0.08] },
    { w: 0.2, h: 0.55, d: 0.55, y: 0.55, color: [0.14, 0.11, 0.09] },
  ],
  sofa: [
    { w: 1.8, h: 0.35, d: 0.75, y: 0.22, color: [0.55, 0.45, 0.6] },
    { w: 1.8, h: 0.4, d: 0.12, y: 0.45, z: 0.32, color: [0.5, 0.4, 0.55] },
    { w: 0.12, h: 0.4, d: 0.75, x: -0.84, y: 0.42, color: [0.48, 0.38, 0.52] },
    { w: 0.12, h: 0.4, d: 0.75, x: 0.84, y: 0.42, color: [0.48, 0.38, 0.52] },
  ],
  sofa_corner: [
    { w: 1.4, h: 0.35, d: 1.1, y: 0.22, color: [0.5, 0.42, 0.55] },
    { w: 0.5, h: 0.35, d: 0.5, x: 0.55, y: 0.22, z: 0.55, color: [0.48, 0.4, 0.52] },
    { w: 1.4, h: 0.38, d: 0.1, y: 0.45, z: 0.5, color: [0.45, 0.38, 0.5] },
  ],
  plant_ficus: [
    { w: 0.28, h: 0.25, d: 0.28, y: 0.12, color: [0.55, 0.36, 0.22] },
    { w: 0.55, h: 0.55, d: 0.55, y: 0.55, color: [0.31, 0.54, 0.34] },
    { w: 0.35, h: 0.35, d: 0.35, x: 0.2, y: 0.75, color: [0.35, 0.58, 0.38] },
  ],
  plant_potted: [
    { w: 0.22, h: 0.2, d: 0.22, y: 0.1, color: [0.6, 0.4, 0.25] },
    { w: 0.35, h: 0.4, d: 0.35, y: 0.38, color: [0.4, 0.62, 0.42] },
  ],
  whiteboard: [
    { w: 2.0, h: 1.1, d: 0.05, y: 1.1, color: [0.97, 0.98, 0.99] },
    { w: 2.05, h: 0.06, d: 0.08, y: 0.55, color: [0.55, 0.58, 0.62] },
  ],
  monitor: [
    { w: 0.48, h: 0.32, d: 0.04, y: 0.62, color: [0.12, 0.14, 0.18] },
    { w: 0.5, h: 0.34, d: 0.02, y: 0.62, z: -0.02, color: [0.2, 0.55, 0.85] },
    { w: 0.12, h: 0.12, d: 0.1, y: 0.38, color: [0.2, 0.2, 0.22] },
    { w: 0.28, h: 0.02, d: 0.18, y: 0.32, color: [0.18, 0.18, 0.2] },
  ],
  laptop: [
    { w: 0.38, h: 0.02, d: 0.28, y: 0.36, color: [0.22, 0.22, 0.25] },
    { w: 0.36, h: 0.22, d: 0.02, y: 0.52, z: -0.12, color: [0.15, 0.15, 0.18] },
    { w: 0.34, h: 0.18, d: 0.01, y: 0.52, z: -0.13, color: [0.25, 0.6, 0.9] },
  ],
  server_rack: [
    { w: 0.5, h: 1.2, d: 0.55, y: 0.6, color: [0.2, 0.22, 0.28] },
    { w: 0.42, h: 0.04, d: 0.02, y: 0.9, z: 0.28, color: [0.3, 0.85, 0.95] },
    { w: 0.42, h: 0.04, d: 0.02, y: 0.7, z: 0.28, color: [0.3, 0.85, 0.95] },
    { w: 0.42, h: 0.04, d: 0.02, y: 0.5, z: 0.28, color: [0.95, 0.55, 0.2] },
  ],
  bookshelf: [
    { w: 0.9, h: 1.4, d: 0.32, y: 0.7, color: [0.45, 0.32, 0.2] },
    { w: 0.85, h: 0.03, d: 0.3, y: 0.35, color: [0.5, 0.36, 0.24] },
    { w: 0.85, h: 0.03, d: 0.3, y: 0.7, color: [0.5, 0.36, 0.24] },
    { w: 0.85, h: 0.03, d: 0.3, y: 1.05, color: [0.5, 0.36, 0.24] },
    { w: 0.12, h: 0.22, d: 0.22, x: -0.25, y: 0.5, z: 0.02, color: [0.6, 0.2, 0.2] },
    { w: 0.1, h: 0.2, d: 0.18, x: 0.1, y: 0.85, z: 0.02, color: [0.2, 0.4, 0.7] },
  ],
  coffee_table: [
    { w: 0.9, h: 0.05, d: 0.5, y: 0.42, color: [0.42, 0.3, 0.2] },
    { w: 0.06, h: 0.42, d: 0.06, x: -0.38, y: 0.21, z: -0.18, color: [0.35, 0.25, 0.18] },
    { w: 0.06, h: 0.42, d: 0.06, x: 0.38, y: 0.21, z: -0.18, color: [0.35, 0.25, 0.18] },
    { w: 0.06, h: 0.42, d: 0.06, x: -0.38, y: 0.21, z: 0.18, color: [0.35, 0.25, 0.18] },
    { w: 0.06, h: 0.42, d: 0.06, x: 0.38, y: 0.21, z: 0.18, color: [0.35, 0.25, 0.18] },
  ],
  filing_cabinet: [
    { w: 0.45, h: 0.9, d: 0.5, y: 0.45, color: [0.55, 0.58, 0.62] },
    { w: 0.38, h: 0.02, d: 0.02, y: 0.7, z: 0.26, color: [0.3, 0.32, 0.36] },
    { w: 0.38, h: 0.02, d: 0.02, y: 0.45, z: 0.26, color: [0.3, 0.32, 0.36] },
    { w: 0.38, h: 0.02, d: 0.02, y: 0.2, z: 0.26, color: [0.3, 0.32, 0.36] },
  ],
  water_cooler: [
    { w: 0.35, h: 0.9, d: 0.35, y: 0.45, color: [0.75, 0.78, 0.82] },
    { w: 0.28, h: 0.35, d: 0.28, y: 1.05, color: [0.4, 0.7, 0.95] },
    { w: 0.08, h: 0.08, d: 0.12, y: 0.75, z: 0.2, color: [0.5, 0.52, 0.55] },
  ],
  floor_lamp: [
    { w: 0.08, h: 1.35, d: 0.08, y: 0.67, color: [0.32, 0.3, 0.28] },
    { w: 0.34, h: 0.18, d: 0.34, y: 1.42, color: [0.95, 0.82, 0.45] },
    { w: 0.42, h: 0.04, d: 0.42, y: 0.02, color: [0.28, 0.26, 0.24] },
  ],
};

for (const [id, parts] of Object.entries(CATALOG)) {
  const path = join(OUT_DIR, `${id}.gltf`);
  writeFileSync(path, buildGltf(parts, id));
  console.log(`Wrote ${path}`);
}

console.log(`Generated ${Object.keys(CATALOG).length} furniture GLTF assets.`);