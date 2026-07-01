import * as THREE from "three";
import type { InteriorZone, OfficeVisualConfig, OfficeLighting, RoomDimensions } from "../../types/visualDesign";
import { floorTextureRepeat } from "../../utils/interiorScale";
import { tagInteriorWall } from "../../utils/interiorWallFade";

export interface RoomShellResult {
  group: THREE.Group;
  exitDoor: THREE.Mesh;
  lobbyGroup: THREE.Group;
  corridorGroup: THREE.Group;
  officeGroup: THREE.Group;
}

function wallMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 });
}

function floorTexture(
  zone: "lobby" | "corridor" | "office",
  baseColor: string,
  width: number,
  depth: number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const tile = zone === "office" ? 8 : zone === "lobby" ? 16 : 12;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += tile) {
      for (let x = 0; x < 64; x += tile) {
        const alt = (x + y) % (tile * 2) === 0;
        if (zone === "lobby") {
          ctx.fillStyle = alt ? "#c4a574" : baseColor;
        } else if (zone === "office") {
          ctx.fillStyle = alt ? adjustHex(baseColor, -12) : baseColor;
        } else {
          ctx.fillStyle = alt ? adjustHex(baseColor, 8) : baseColor;
        }
        ctx.globalAlpha = zone === "corridor" ? 0.7 : 0.9;
        ctx.fillRect(x, y, tile, tile);
        ctx.globalAlpha = 1;
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const [repeatX, repeatZ] = floorTextureRepeat(width, depth);
  texture.repeat.set(repeatX, repeatZ);
  return texture;
}

function adjustHex(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount / 100, 0, 1));
  return `#${color.getHexString()}`;
}

function lightingTint(lighting: OfficeLighting): { window: string; intensity: number } {
  switch (lighting) {
    case "warm":
      return { window: "#ffe8c8", intensity: 0.22 };
    case "cool":
      return { window: "#d8ecff", intensity: 0.18 };
    default:
      return { window: "#f4f8ff", intensity: 0.15 };
  }
}

function buildZoneBox(
  dims: RoomDimensions,
  floorColor: string,
  wallColor: string,
  accentColor: string,
  zone: InteriorZone,
  options: { doorFront?: boolean; cutaway?: boolean; label?: string },
): THREE.Group {
  const group = new THREE.Group();
  const { width, depth, height } = dims;
  const halfW = width / 2;
  const halfD = depth / 2;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      map: floorTexture(zone, floorColor, width, depth),
      roughness: zone === "lobby" ? 0.75 : 0.86,
      metalness: 0.03,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const wallThickness = 0.12;
  const wallMat = wallMaterial(wallColor);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, wallThickness),
    wallMat,
  );
  backWall.position.set(0, height / 2, -halfD);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  tagInteriorWall(backWall, zone, "back");
  group.add(backWall);

  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, height, depth),
    wallMat,
  );
  leftWall.position.set(-halfW, height / 2, 0);
  tagInteriorWall(leftWall, zone, "left");
  group.add(leftWall);

  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, height, depth),
    wallMat,
  );
  rightWall.position.set(halfW, height / 2, 0);
  tagInteriorWall(rightWall, zone, "right");
  group.add(rightWall);

  const cutaway = options.cutaway ?? true;
  const doorWidth = 1.15;
  const lowerWallHeight = cutaway ? height * 0.42 : height;

  if (options.doorFront && cutaway) {
    const sideWidth = (width - doorWidth) / 2;
    if (sideWidth > 0.2) {
      for (const sign of [-1, 1] as const) {
        const segment = new THREE.Mesh(
          new THREE.BoxGeometry(sideWidth, lowerWallHeight, wallThickness),
          wallMat,
        );
        segment.position.set(sign * (doorWidth / 2 + sideWidth / 2), lowerWallHeight / 2, halfD);
        tagInteriorWall(segment, zone, "front");
        group.add(segment);
      }
    }
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth, height - lowerWallHeight, wallThickness),
      wallMat,
    );
    lintel.position.set(0, lowerWallHeight + (height - lowerWallHeight) / 2, halfD);
    tagInteriorWall(lintel, zone, "front");
    group.add(lintel);
  } else {
    const frontWall = new THREE.Mesh(
      new THREE.BoxGeometry(width, lowerWallHeight, wallThickness),
      wallMat,
    );
    frontWall.position.set(0, lowerWallHeight / 2, halfD);
    tagInteriorWall(frontWall, zone, "front");
    group.add(frontWall);
  }

  if (cutaway) {
    const window = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.72, height * 0.38),
      new THREE.MeshStandardMaterial({
        color: "#d8ecff",
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    window.position.set(0, height * 0.72, halfD + wallThickness * 0.4);
    group.add(window);
  }

  const baseboard = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.1, 0.08, depth - 0.1),
    new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.7 }),
  );
  baseboard.position.set(0, 0.04, 0);
  group.add(baseboard);

  if (!cutaway) {
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95, side: THREE.DoubleSide }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    group.add(ceiling);
  }

  if (options.label) {
    group.userData.zoneLabel = options.label;
  }

  return group;
}

/**
 * Builds lobby (front/+Z) → corridor → office (back/-Z) along the Z axis.
 * Origin is the center of the full interior footprint.
 */
export function buildRoomShell(office: OfficeVisualConfig): RoomShellResult {
  const lobby = office.lobby_room;
  const corridor = office.corridor_room;
  const room = office.room;
  const windowTint = lightingTint(office.lighting);

  const totalDepth = lobby.depth + corridor.depth + room.depth;
  const maxWidth = Math.max(lobby.width, corridor.width, room.width);

  const group = new THREE.Group();

  const lobbyZ = totalDepth / 2 - lobby.depth / 2;
  const corridorZ = lobbyZ - lobby.depth / 2 - corridor.depth / 2;
  const officeZ = corridorZ - corridor.depth / 2 - room.depth / 2;

  const lobbyGroup = buildZoneBox(lobby, office.floor_color, office.wall_color, office.accent_color, "lobby", {
    label: "lobby",
    doorFront: true,
    cutaway: true,
  });
  lobbyGroup.position.set(0, 0, lobbyZ);
  group.add(lobbyGroup);

  const corridorGroup = buildZoneBox(
    corridor,
    office.floor_color,
    office.wall_color,
    office.accent_color,
    "corridor",
    { label: "corridor", cutaway: true },
  );
  corridorGroup.position.set(0, 0, corridorZ);
  group.add(corridorGroup);

  const officeGroup = buildZoneBox(room, office.floor_color, office.wall_color, office.accent_color, "office", {
    label: "office",
    cutaway: true,
  });
  officeGroup.position.set(0, 0, officeZ);
  group.add(officeGroup);

  const exitDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.1, 0.14),
    new THREE.MeshStandardMaterial({
      color: "#3d4f62",
      emissive: new THREE.Color(office.accent_color),
      emissiveIntensity: 0.2,
      roughness: 0.45,
    }),
  );
  exitDoor.position.set(0, 1.05, lobbyZ + lobby.depth / 2 + 0.06);
  exitDoor.userData.isExit = true;
  group.add(exitDoor);

  const windowStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(maxWidth * 0.6, 0.8),
    new THREE.MeshStandardMaterial({
      color: windowTint.window,
      emissive: new THREE.Color(office.accent_color),
      emissiveIntensity: windowTint.intensity,
      transparent: true,
      opacity: 0.6,
    }),
  );
  windowStrip.position.set(0, 1.8, lobbyZ + lobby.depth / 2 + 0.08);
  group.add(windowStrip);

  const officeWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width * 0.5, 0.55),
    new THREE.MeshStandardMaterial({
      color: windowTint.window,
      emissive: new THREE.Color(office.accent_color),
      emissiveIntensity: windowTint.intensity * 0.85,
      transparent: true,
      opacity: 0.5,
    }),
  );
  officeWindow.position.set(0, 1.65, officeZ - room.depth / 2 - 0.05);
  group.add(officeWindow);

  group.userData.officeZ = officeZ;
  group.userData.lobbyZ = lobbyZ;

  return { group, exitDoor, lobbyGroup, corridorGroup, officeGroup };
}

export function officeZoneOffset(shell: RoomShellResult): number {
  return (shell.group.userData.officeZ as number) ?? 0;
}