import type { InteriorZone, OfficeVisualConfig } from "../types/visualDesign";
import type { InteriorOrbitState } from "./interiorCamera";

export interface WalkKeyState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

export const WALK_KEYBOARD_SPEED = 2.6;

export function interiorZoneCenterPan(
  office: OfficeVisualConfig,
  zone: InteriorZone,
): { panX: number; panZ: number } {
  const { lobby_room: lobby, corridor_room: corridor, room } = office;
  const totalDepth = lobby.depth + corridor.depth + room.depth;
  const lobbyZ = totalDepth / 2 - lobby.depth / 2;
  const corridorZ = lobbyZ - lobby.depth / 2 - corridor.depth / 2;
  const officeZ = corridorZ - corridor.depth / 2 - room.depth / 2;
  const panZ = zone === "lobby" ? lobbyZ : zone === "corridor" ? corridorZ : officeZ;
  return { panX: 0, panZ };
}

export function interiorWalkBounds(office: OfficeVisualConfig): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const maxW = Math.max(office.lobby_room.width, office.corridor_room.width, office.room.width);
  const totalD =
    office.lobby_room.depth + office.corridor_room.depth + office.room.depth;
  const margin = 0.42;
  return {
    minX: -maxW / 2 + margin,
    maxX: maxW / 2 - margin,
    minZ: -totalD / 2 + margin,
    maxZ: totalD / 2 - margin,
  };
}

export function clampWalkPan(orbit: InteriorOrbitState, office: OfficeVisualConfig): void {
  const bounds = interiorWalkBounds(office);
  orbit.panX = Math.max(bounds.minX, Math.min(bounds.maxX, orbit.panX));
  orbit.panZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, orbit.panZ));
}

export function walkZoneAtPan(
  office: OfficeVisualConfig,
  panX: number,
  panZ: number,
): InteriorZone {
  const { lobby_room: lobby, corridor_room: corridor, room } = office;
  const totalDepth = lobby.depth + corridor.depth + room.depth;
  const lobbyZ = totalDepth / 2 - lobby.depth / 2;
  const corridorZ = lobbyZ - lobby.depth / 2 - corridor.depth / 2;
  const officeZ = corridorZ - corridor.depth / 2 - room.depth / 2;
  const halfLobby = lobby.depth / 2;
  const halfCorridor = corridor.depth / 2;
  const halfOffice = room.depth / 2;
  const maxHalfW = Math.max(lobby.width, corridor.width, room.width) / 2;

  if (Math.abs(panX) > maxHalfW) {
    return "corridor";
  }
  if (panZ >= lobbyZ - halfLobby && panZ <= lobbyZ + halfLobby) {
    return "lobby";
  }
  if (panZ >= corridorZ - halfCorridor && panZ <= corridorZ + halfCorridor) {
    return "corridor";
  }
  if (panZ >= officeZ - halfOffice && panZ <= officeZ + halfOffice) {
    return "office";
  }
  return panZ > corridorZ ? "lobby" : "office";
}

export function applyWalkKeyboardMove(
  orbit: InteriorOrbitState,
  keys: WalkKeyState,
  delta: number,
  speed = WALK_KEYBOARD_SPEED,
): boolean {
  let moveX = 0;
  let moveZ = 0;
  if (keys.forward) {
    moveX -= Math.sin(orbit.azimuth);
    moveZ -= Math.cos(orbit.azimuth);
  }
  if (keys.back) {
    moveX += Math.sin(orbit.azimuth);
    moveZ += Math.cos(orbit.azimuth);
  }
  if (keys.left) {
    moveX -= Math.cos(orbit.azimuth);
    moveZ += Math.sin(orbit.azimuth);
  }
  if (keys.right) {
    moveX += Math.cos(orbit.azimuth);
    moveZ -= Math.sin(orbit.azimuth);
  }
  const length = Math.hypot(moveX, moveZ);
  if (length < 1e-6) {
    return false;
  }
  const scale = (speed * delta) / length;
  orbit.panX += moveX * scale;
  orbit.panZ += moveZ * scale;
  return true;
}

export function emptyWalkKeys(): WalkKeyState {
  return { forward: false, back: false, left: false, right: false };
}