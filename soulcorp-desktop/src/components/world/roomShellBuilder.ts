import * as THREE from "three";
import { getOfficeThemePack } from "../../data/officeThemePacks";
import type { InteriorZone, OfficeVisualConfig, RoomDimensions } from "../../types/visualDesign";
import {
  createBaseboardMaterial,
  createRoomFloorTexture,
  createWallPlasterMaterial,
} from "../../utils/roomKitTextures";
import { buildFreeformArchitectureGroup } from "../../utils/officeArchitecture";
import { tagInteriorWall } from "../../utils/interiorWallFade";

export interface RoomShellResult {
  group: THREE.Group;
  exitDoor: THREE.Mesh;
  lobbyGroup: THREE.Group;
  corridorGroup: THREE.Group;
  officeGroup: THREE.Group;
}

function lightingTint(office: OfficeVisualConfig): { window: string; intensity: number; opacity: number } {
  const theme = getOfficeThemePack(office.theme_pack);
  switch (office.lighting) {
    case "warm":
      return { window: theme.window_tint, intensity: 0.24, opacity: 0.72 };
    case "cool":
      return { window: theme.window_tint, intensity: 0.2, opacity: 0.68 };
    default:
      return { window: theme.window_tint, intensity: 0.18, opacity: 0.65 };
  }
}

const BASEBOARD_HEIGHT = 0.08;
const BASEBOARD_DEPTH = 0.035;

function addPerimeterBaseboards(
  group: THREE.Group,
  width: number,
  depth: number,
  accentColor: string,
  options: { doorFront?: boolean; doorWidth?: number },
): void {
  const mat = createBaseboardMaterial(accentColor);
  const halfW = width / 2;
  const halfD = depth / 2;
  const y = BASEBOARD_HEIGHT / 2;
  const inset = BASEBOARD_DEPTH / 2 + 0.01;

  const back = new THREE.Mesh(new THREE.BoxGeometry(width, BASEBOARD_HEIGHT, BASEBOARD_DEPTH), mat);
  back.position.set(0, y, -halfD + inset);
  back.userData.roomKit = "baseboard";
  group.add(back);

  const left = new THREE.Mesh(new THREE.BoxGeometry(BASEBOARD_DEPTH, BASEBOARD_HEIGHT, depth), mat);
  left.position.set(-halfW + inset, y, 0);
  left.userData.roomKit = "baseboard";
  group.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(BASEBOARD_DEPTH, BASEBOARD_HEIGHT, depth), mat);
  right.position.set(halfW - inset, y, 0);
  right.userData.roomKit = "baseboard";
  group.add(right);

  const doorWidth = options.doorWidth ?? 1.15;
  if (options.doorFront) {
    const sideWidth = (width - doorWidth) / 2;
    if (sideWidth > 0.2) {
      for (const sign of [-1, 1] as const) {
        const segment = new THREE.Mesh(
          new THREE.BoxGeometry(sideWidth, BASEBOARD_HEIGHT, BASEBOARD_DEPTH),
          mat,
        );
        segment.position.set(sign * (doorWidth / 2 + sideWidth / 2), y, halfD - inset);
        segment.userData.roomKit = "baseboard";
        group.add(segment);
      }
    }
  } else {
    const front = new THREE.Mesh(new THREE.BoxGeometry(width, BASEBOARD_HEIGHT, BASEBOARD_DEPTH), mat);
    front.position.set(0, y, halfD - inset);
    front.userData.roomKit = "baseboard";
    group.add(front);
  }

}

function buildZoneBox(
  dims: RoomDimensions,
  office: OfficeVisualConfig,
  zone: InteriorZone,
  windowTint: ReturnType<typeof lightingTint>,
  options: { doorFront?: boolean; cutaway?: boolean; label?: string },
): THREE.Group {
  const group = new THREE.Group();
  const { width, depth, height } = dims;
  const halfW = width / 2;
  const halfD = depth / 2;
  const wallColor = office.wall_color;
  const accentColor = office.accent_color;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      map: createRoomFloorTexture(office, zone, width, depth),
      roughness: zone === "lobby" ? 0.72 : 0.84,
      metalness: 0.02,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.roomKit = "floor";
  group.add(floor);

  const wallMat = createWallPlasterMaterial(wallColor);
  const wallThickness = 0.12;

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThickness), wallMat);
  backWall.position.set(0, height / 2, -halfD);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  tagInteriorWall(backWall, zone, "back");
  group.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, depth), wallMat);
  leftWall.position.set(-halfW, height / 2, 0);
  tagInteriorWall(leftWall, zone, "left");
  group.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, depth), wallMat);
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
        color: windowTint.window,
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: windowTint.opacity,
        side: THREE.DoubleSide,
      }),
    );
    window.position.set(0, height * 0.72, halfD + wallThickness * 0.4);
    window.userData.roomKit = "window";
    group.add(window);
  }

  addPerimeterBaseboards(group, width, depth, accentColor, {
    doorFront: options.doorFront,
    doorWidth,
  });

  const trimMat = createBaseboardMaterial(accentColor);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(width - 0.16, 0.04, 0.02), trimMat);
  crown.position.set(0, height - 0.06, -halfD + 0.08);
  crown.userData.roomKit = "accent_trim";
  group.add(crown);

  if (!cutaway) {
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      createWallPlasterMaterial(wallColor),
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
  const windowTint = lightingTint(office);

  const totalDepth = lobby.depth + corridor.depth + room.depth;
  const maxWidth = Math.max(lobby.width, corridor.width, room.width);

  const group = new THREE.Group();

  const lobbyZ = totalDepth / 2 - lobby.depth / 2;
  const corridorZ = lobbyZ - lobby.depth / 2 - corridor.depth / 2;
  const officeZ = corridorZ - corridor.depth / 2 - room.depth / 2;

  const lobbyGroup = buildZoneBox(lobby, office, "lobby", windowTint, {
    label: "lobby",
    doorFront: true,
    cutaway: true,
  });
  lobbyGroup.position.set(0, 0, lobbyZ);
  group.add(lobbyGroup);

  const corridorGroup = buildZoneBox(corridor, office, "corridor", windowTint, {
    label: "corridor",
    cutaway: true,
  });
  corridorGroup.position.set(0, 0, corridorZ);
  group.add(corridorGroup);

  const officeGroup = buildZoneBox(room, office, "office", windowTint, {
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
      opacity: windowTint.opacity,
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
      opacity: windowTint.opacity * 0.92,
    }),
  );
  officeWindow.position.set(0, 1.65, officeZ - room.depth / 2 - 0.05);
  group.add(officeWindow);

  group.userData.officeZ = officeZ;
  group.userData.lobbyZ = lobbyZ;

  const freeform = buildFreeformArchitectureGroup(office);
  if (freeform) {
    group.add(freeform);
  }

  return { group, exitDoor, lobbyGroup, corridorGroup, officeGroup };
}

export function officeZoneOffset(shell: RoomShellResult): number {
  return (shell.group.userData.officeZ as number) ?? 0;
}