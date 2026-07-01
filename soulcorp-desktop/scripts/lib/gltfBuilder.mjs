/**
 * Multi-material GLTF 2.0 builder for SoulCorp furniture assets.
 * Outputs .gltf + .bin with external PNG texture references.
 */

const MAT_PROPS = {
  wood: { texture: "wood", roughness: 0.72, metalness: 0.02 },
  fabric: { texture: "fabric", roughness: 0.92, metalness: 0 },
  fabric_dark: { texture: "fabric_dark", roughness: 0.9, metalness: 0 },
  metal: { texture: "metal", roughness: 0.38, metalness: 0.82 },
  plastic: { texture: "plastic", roughness: 0.55, metalness: 0.08 },
  whiteboard: { texture: "whiteboard", roughness: 0.35, metalness: 0 },
  screen: { texture: "screen", roughness: 0.2, metalness: 0.05, emissive: true },
  plant: { texture: "plant", roughness: 0.85, metalness: 0 },
  pot: { texture: "pot", roughness: 0.78, metalness: 0 },
  accent: { texture: "accent", roughness: 0.45, metalness: 0.12 },
  laminate: { texture: "laminate", roughness: 0.48, metalness: 0.06 },
};

export class GltfBuilder {
  /** @param {Record<string, string>} texturePaths map slot → relative uri */
  constructor(texturePaths) {
    this.texturePaths = texturePaths;
    this.parts = [];
    this.materialSlots = [];
  }

  /** @param {{ w: number, h: number, d: number, x?: number, y?: number, z?: number, material: string, name: string }} spec */
  box(spec) {
    this.parts.push({ type: "box", ...spec });
    if (!this.materialSlots.includes(spec.material)) {
      this.materialSlots.push(spec.material);
    }
    return this;
  }

  /** @param {{ radius: number, height: number, segments?: number, x?: number, y?: number, z?: number, material: string, name: string }} spec */
  cylinder(spec) {
    this.parts.push({ type: "cylinder", segments: 12, ...spec });
    if (!this.materialSlots.includes(spec.material)) {
      this.materialSlots.push(spec.material);
    }
    return this;
  }

  build(assetName) {
    const binChunks = [];
    const accessors = [];
    const bufferViews = [];
    const meshes = [];
    const childNodes = [];
    let byteOffset = 0;

    const imageUris = [...new Set(this.materialSlots.map((s) => this.texturePaths[MAT_PROPS[s]?.texture ?? "wood"]))];
    const images = imageUris.map((uri) => ({ uri }));
    const textures = imageUris.map((_, i) => ({ source: i }));

    const materials = this.materialSlots.map((slot) => {
      const props = MAT_PROPS[slot] ?? MAT_PROPS.wood;
      const uri = this.texturePaths[props.texture];
      const texIndex = imageUris.indexOf(uri);
      const mat = {
        name: slot,
        pbrMetallicRoughness: {
          roughnessFactor: props.roughness,
          metallicFactor: props.metalness,
          baseColorTexture: { index: texIndex },
        },
      };
      if (props.emissive) {
        mat.emissiveFactor = [0.35, 0.6, 0.95];
        mat.emissiveTexture = { index: texIndex };
      }
      return mat;
    });

    for (const part of this.parts) {
      const geom =
        part.type === "box" ? buildBoxGeometry(part) : buildCylinderGeometry(part);

      const vertBytes = new Float32Array(geom.vertices);
      const normBytes = new Float32Array(geom.normals);
      const uvBytes = new Float32Array(geom.uvs);
      const idxBytes = new Uint16Array(geom.indices);

      const vertLen = vertBytes.byteLength;
      const normLen = normBytes.byteLength;
      const uvLen = uvBytes.byteLength;
      const idxLen = idxBytes.byteLength;

      const vertView = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset, byteLength: vertLen, target: 34962 });
      byteOffset += vertLen;
      const normView = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset, byteLength: normLen, target: 34962 });
      byteOffset += normLen;
      const uvView = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset, byteLength: uvLen, target: 34962 });
      byteOffset += uvLen;
      const idxView = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset, byteLength: idxLen, target: 34963 });
      byteOffset += idxLen;

      binChunks.push(
        Buffer.from(vertBytes.buffer),
        Buffer.from(normBytes.buffer),
        Buffer.from(uvBytes.buffer),
        Buffer.from(idxBytes.buffer),
      );

      const posAcc = accessors.length;
      accessors.push(vec3Accessor(vertView, geom.vertices));
      const normAcc = accessors.length;
      accessors.push(vec3Accessor(normView, geom.normals));
      const uvAcc = accessors.length;
      accessors.push(vec2Accessor(uvView, geom.uvs));
      const idxAcc = accessors.length;
      accessors.push({
        bufferView: idxView,
        componentType: 5123,
        count: geom.indices.length,
        type: "SCALAR",
      });

      const matIndex = this.materialSlots.indexOf(part.material);
      meshes.push({
        name: part.name,
        primitives: [
          {
            attributes: { POSITION: posAcc, NORMAL: normAcc, TEXCOORD_0: uvAcc },
            indices: idxAcc,
            material: matIndex,
            mode: 4,
          },
        ],
      });
      childNodes.push({ name: part.name, mesh: meshes.length - 1 });
    }

    const bin = Buffer.concat(binChunks);
    const rootChildren = childNodes.map((_, i) => i + 1);

    return {
      gltf: {
        asset: { version: "2.0", generator: "soulcorp-furniture-gen-b2" },
        scene: 0,
        scenes: [{ name: assetName, nodes: [0] }],
        nodes: [{ name: assetName, children: rootChildren }, ...childNodes],
        meshes,
        materials,
        textures,
        images,
        accessors,
        bufferViews,
        buffers: [{ byteLength: bin.length, uri: `${assetName}.bin` }],
      },
      bin,
      partNames: this.parts.map((p) => p.name),
    };
  }
}

function vec3Accessor(bufferView, flat) {
  const xs = [];
  const ys = [];
  const zs = [];
  for (let i = 0; i < flat.length; i += 3) {
    xs.push(flat[i]);
    ys.push(flat[i + 1]);
    zs.push(flat[i + 2]);
  }
  return {
    bufferView,
    componentType: 5126,
    count: flat.length / 3,
    type: "VEC3",
    min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
  };
}

function vec2Accessor(bufferView, flat) {
  const us = [];
  const vs = [];
  for (let i = 0; i < flat.length; i += 2) {
    us.push(flat[i]);
    vs.push(flat[i + 1]);
  }
  return {
    bufferView,
    componentType: 5126,
    count: flat.length / 2,
    type: "VEC2",
    min: [Math.min(...us), Math.min(...vs)],
    max: [Math.max(...us), Math.max(...vs)],
  };
}

function buildBoxGeometry(part) {
  const { w, h, d } = part;
  const px = part.x ?? 0;
  const py = part.y ?? h / 2;
  const pz = part.z ?? 0;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;

  const vertices = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const faces = [
    { n: [0, 0, 1], corners: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
    { n: [0, 0, -1], corners: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
    { n: [0, 1, 0], corners: [[-hw, hh, -hd], [-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd]] },
    { n: [0, -1, 0], corners: [[-hw, -hh, hd], [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd]] },
    { n: [1, 0, 0], corners: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
    { n: [-1, 0, 0], corners: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] },
  ];

  let v = 0;
  for (const face of faces) {
    const [nx, ny, nz] = face.n;
    const uvCorners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (let i = 0; i < 4; i += 1) {
      const [x, y, z] = face.corners[i];
      vertices.push(x + px, y + py, z + pz);
      normals.push(nx, ny, nz);
      uvs.push(uvCorners[i][0], uvCorners[i][1]);
    }
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }

  return { vertices, normals, uvs, indices };
}

function buildCylinderGeometry(part) {
  const { radius, height, segments = 12 } = part;
  const px = part.x ?? 0;
  const py = part.y ?? height / 2;
  const pz = part.z ?? 0;
  const hh = height / 2;

  const vertices = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  let v = 0;
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = (next / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    const nx = (Math.cos(a0) + Math.cos(a1)) / 2;
    const nz = (Math.sin(a0) + Math.sin(a1)) / 2;
    const u0 = i / segments;
    const u1 = (i + 1) / segments;
    const quad = [
      { p: [x0, -hh, z0], uv: [u0, 0] },
      { p: [x1, -hh, z1], uv: [u1, 0] },
      { p: [x1, hh, z1], uv: [u1, 1] },
      { p: [x0, hh, z0], uv: [u0, 1] },
    ];
    for (const corner of quad) {
      vertices.push(corner.p[0] + px, corner.p[1] + py, corner.p[2] + pz);
      normals.push(nx, 0, nz);
      uvs.push(corner.uv[0], corner.uv[1]);
    }
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }

  return { vertices, normals, uvs, indices };
}

/** 8 core B2 assets with Sims-style silhouettes and material slots. */
export function coreAssetDefinitions() {
  return {
    desk_open: (b) =>
      b
        .box({ w: 1.2, h: 0.06, d: 0.75, y: 0.72, material: "wood", name: "wood_top" })
        .box({ w: 0.07, h: 0.68, d: 0.07, x: -0.52, y: 0.34, z: -0.3, material: "metal", name: "metal_leg_fl" })
        .box({ w: 0.07, h: 0.68, d: 0.07, x: 0.52, y: 0.34, z: -0.3, material: "metal", name: "metal_leg_fr" })
        .box({ w: 0.07, h: 0.68, d: 0.07, x: -0.52, y: 0.34, z: 0.3, material: "metal", name: "metal_leg_bl" })
        .box({ w: 0.07, h: 0.68, d: 0.07, x: 0.52, y: 0.34, z: 0.3, material: "metal", name: "metal_leg_br" })
        .box({ w: 1.0, h: 0.02, d: 0.55, y: 0.76, z: 0.05, material: "accent", name: "accent_trim" }),

    chair_office: (b) =>
      b
        .box({ w: 0.44, h: 0.07, d: 0.44, y: 0.48, material: "fabric", name: "fabric_seat" })
        .box({ w: 0.42, h: 0.48, d: 0.06, y: 0.72, z: -0.18, material: "fabric_dark", name: "fabric_back" })
        .box({ w: 0.38, h: 0.04, d: 0.38, y: 0.44, material: "plastic", name: "plastic_base" })
        .cylinder({ radius: 0.025, height: 0.38, x: -0.15, y: 0.22, z: -0.14, material: "metal", name: "metal_leg_fl" })
        .cylinder({ radius: 0.025, height: 0.38, x: 0.15, y: 0.22, z: -0.14, material: "metal", name: "metal_leg_fr" })
        .cylinder({ radius: 0.025, height: 0.38, x: -0.15, y: 0.22, z: 0.14, material: "metal", name: "metal_leg_bl" })
        .cylinder({ radius: 0.025, height: 0.38, x: 0.15, y: 0.22, z: 0.14, material: "metal", name: "metal_leg_br" })
        .box({ w: 0.1, h: 0.12, d: 0.06, y: 0.58, z: -0.2, material: "accent", name: "accent_headrest" }),

    sofa: (b) =>
      b
        .box({ w: 1.8, h: 0.32, d: 0.72, y: 0.2, material: "fabric", name: "fabric_seat" })
        .box({ w: 1.8, h: 0.38, d: 0.14, y: 0.46, z: 0.32, material: "fabric_dark", name: "fabric_back" })
        .box({ w: 0.14, h: 0.36, d: 0.72, x: -0.83, y: 0.42, material: "fabric_dark", name: "fabric_arm_l" })
        .box({ w: 0.14, h: 0.36, d: 0.72, x: 0.83, y: 0.42, material: "fabric_dark", name: "fabric_arm_r" })
        .box({ w: 1.6, h: 0.06, d: 0.6, y: 0.38, material: "accent", name: "accent_cushion" }),

    plant_ficus: (b) =>
      b
        .cylinder({ radius: 0.16, height: 0.28, y: 0.14, material: "pot", name: "pot_body" })
        .box({ w: 0.52, h: 0.52, d: 0.52, y: 0.58, material: "plant", name: "plant_canopy" })
        .box({ w: 0.32, h: 0.32, d: 0.32, x: 0.18, y: 0.82, material: "plant", name: "plant_cluster" }),

    monitor: (b) =>
      b
        .box({ w: 0.5, h: 0.34, d: 0.03, y: 0.62, material: "plastic", name: "plastic_bezel" })
        .box({ w: 0.46, h: 0.3, d: 0.01, y: 0.62, z: -0.015, material: "screen", name: "emissive_screen" })
        .box({ w: 0.1, h: 0.1, d: 0.08, y: 0.38, material: "plastic", name: "plastic_neck" })
        .box({ w: 0.28, h: 0.02, d: 0.2, y: 0.32, material: "metal", name: "metal_base" }),

    reception_desk: (b) =>
      b
        .box({ w: 1.6, h: 0.08, d: 0.7, y: 0.55, material: "laminate", name: "laminate_counter" })
        .box({ w: 1.4, h: 0.88, d: 0.12, x: 0, y: 0.44, z: 0.34, material: "laminate", name: "laminate_front" })
        .box({ w: 0.1, h: 0.48, d: 0.1, x: -0.68, y: 0.24, z: -0.26, material: "metal", name: "metal_leg_l" })
        .box({ w: 0.1, h: 0.48, d: 0.1, x: 0.68, y: 0.24, z: -0.26, material: "metal", name: "metal_leg_r" })
        .box({ w: 0.5, h: 0.04, d: 0.55, y: 0.59, z: 0.05, material: "accent", name: "accent_panel" }),

    whiteboard: (b) =>
      b
        .box({ w: 2.0, h: 1.05, d: 0.04, y: 1.08, material: "whiteboard", name: "whiteboard_surface" })
        .box({ w: 2.04, h: 0.06, d: 0.08, y: 0.55, material: "metal", name: "metal_frame" })
        .box({ w: 0.12, h: 0.04, d: 0.04, x: -0.85, y: 0.52, z: 0.05, material: "accent", name: "accent_marker_tray" }),

    floor_lamp: (b) =>
      b
        .cylinder({ radius: 0.2, height: 0.04, y: 0.02, material: "metal", name: "metal_base" })
        .cylinder({ radius: 0.035, height: 1.32, y: 0.68, material: "metal", name: "metal_pole" })
        .box({ w: 0.36, h: 0.2, d: 0.36, y: 1.42, material: "accent", name: "accent_shade" })
        .box({ w: 0.28, h: 0.12, d: 0.28, y: 1.4, material: "screen", name: "emissive_bulb" }),
  };
}

/** Textured variants for remaining catalog entries. */
export function secondaryAssetDefinitions() {
  const leg = (b, mat = "metal") => (x, z) =>
    b.box({ w: 0.07, h: 0.65, d: 0.07, x, y: 0.32, z, material: mat, name: `leg_${x}_${z}` });

  return {
    desk_cubicle: (b) => {
      leg(b)(-0.45, -0.35);
      leg(b)(0.45, -0.35);
      leg(b)(-0.45, 0.35);
      leg(b)(0.45, 0.35);
      return b
        .box({ w: 1.1, h: 0.05, d: 0.9, y: 0.68, material: "laminate", name: "laminate_top" })
        .box({ w: 1.1, h: 0.45, d: 0.05, y: 0.42, z: 0.42, material: "plastic", name: "plastic_panel" });
    },
    desk_executive: (b) =>
      b
        .box({ w: 1.45, h: 0.07, d: 0.82, y: 0.72, material: "wood", name: "wood_top" })
        .box({ w: 0.55, h: 0.62, d: 0.48, y: 0.35, material: "wood", name: "wood_pedestal" }),
    desk_creative: (b) => {
      leg(b, "plastic")(-0.5, -0.4);
      leg(b, "plastic")(0.5, -0.4);
      leg(b, "plastic")(-0.5, 0.4);
      leg(b, "plastic")(0.5, 0.4);
      return b.box({ w: 1.3, h: 0.05, d: 1.0, y: 0.66, material: "accent", name: "accent_top" });
    },
    desk_lounge: (b) =>
      b
        .box({ w: 1.0, h: 0.04, d: 1.1, y: 0.54, material: "wood", name: "wood_top" })
        .box({ w: 0.9, h: 0.42, d: 0.35, y: 0.22, z: 0.34, material: "fabric", name: "fabric_panel" }),
    chair_executive: (b) =>
      b
        .box({ w: 0.54, h: 0.08, d: 0.54, y: 0.5, material: "fabric_dark", name: "fabric_seat" })
        .box({ w: 0.5, h: 0.62, d: 0.08, y: 0.78, z: -0.2, material: "fabric_dark", name: "fabric_back" })
        .box({ w: 0.22, h: 0.52, d: 0.52, y: 0.56, material: "fabric", name: "fabric_arm" }),
    sofa_corner: (b) =>
      b
        .box({ w: 1.4, h: 0.32, d: 1.05, y: 0.2, material: "fabric", name: "fabric_seat" })
        .box({ w: 0.48, h: 0.32, d: 0.48, x: 0.52, y: 0.2, z: 0.52, material: "fabric", name: "fabric_extension" })
        .box({ w: 1.4, h: 0.36, d: 0.1, y: 0.44, z: 0.48, material: "fabric_dark", name: "fabric_back" }),
    plant_potted: (b) =>
      b
        .cylinder({ radius: 0.12, height: 0.2, y: 0.1, material: "pot", name: "pot_body" })
        .box({ w: 0.34, h: 0.38, d: 0.34, y: 0.38, material: "plant", name: "plant_canopy" }),
    laptop: (b) =>
      b
        .box({ w: 0.38, h: 0.02, d: 0.28, y: 0.36, material: "metal", name: "metal_base" })
        .box({ w: 0.36, h: 0.2, d: 0.02, y: 0.5, z: -0.12, material: "plastic", name: "plastic_lid" })
        .box({ w: 0.34, h: 0.16, d: 0.01, y: 0.5, z: -0.13, material: "screen", name: "emissive_screen" }),
    server_rack: (b) =>
      b
        .box({ w: 0.5, h: 1.18, d: 0.55, y: 0.59, material: "metal", name: "metal_frame" })
        .box({ w: 0.42, h: 0.03, d: 0.02, y: 0.88, z: 0.28, material: "screen", name: "emissive_led_1" })
        .box({ w: 0.42, h: 0.03, d: 0.02, y: 0.68, z: 0.28, material: "accent", name: "accent_led_2" }),
    bookshelf: (b) =>
      b
        .box({ w: 0.9, h: 1.38, d: 0.32, y: 0.69, material: "wood", name: "wood_frame" })
        .box({ w: 0.84, h: 0.03, d: 0.28, y: 0.35, material: "wood", name: "wood_shelf_1" })
        .box({ w: 0.84, h: 0.03, d: 0.28, y: 0.7, material: "wood", name: "wood_shelf_2" })
        .box({ w: 0.12, h: 0.2, d: 0.2, x: -0.22, y: 0.5, z: 0.02, material: "accent", name: "accent_book" }),
    coffee_table: (b) => {
      leg(b)(-0.36, -0.2);
      leg(b)(0.36, -0.2);
      leg(b)(-0.36, 0.2);
      leg(b)(0.36, 0.2);
      return b.box({ w: 0.9, h: 0.05, d: 0.5, y: 0.4, material: "wood", name: "wood_top" });
    },
    filing_cabinet: (b) =>
      b
        .box({ w: 0.45, h: 0.88, d: 0.5, y: 0.44, material: "metal", name: "metal_body" })
        .box({ w: 0.38, h: 0.02, d: 0.02, y: 0.68, z: 0.26, material: "plastic", name: "plastic_handle" }),
    water_cooler: (b) =>
      b
        .box({ w: 0.35, h: 0.88, d: 0.35, y: 0.44, material: "plastic", name: "plastic_body" })
        .box({ w: 0.28, h: 0.32, d: 0.28, y: 1.02, material: "screen", name: "emissive_tank" }),
  };
}

export const CORE_FURNITURE_IDS = [
  "desk_open",
  "chair_office",
  "sofa",
  "plant_ficus",
  "monitor",
  "reception_desk",
  "whiteboard",
  "floor_lamp",
];