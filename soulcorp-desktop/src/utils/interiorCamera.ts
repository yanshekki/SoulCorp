import * as THREE from "three";
import type { OfficeVisualConfig } from "../types/visualDesign";

export interface InteriorOrbitState {
  dragging: boolean;
  lastX: number;
  lastY: number;
  azimuth: number;
  elevation: number;
  frustum: number;
  zoom: number;
  panX: number;
  panZ: number;
}

export function officeZoneCenterZ(office: OfficeVisualConfig): number {
  const { lobby_room: lobby, corridor_room: corridor, room } = office;
  const totalDepth = lobby.depth + corridor.depth + room.depth;
  const lobbyZ = totalDepth / 2 - lobby.depth / 2;
  const corridorZ = lobbyZ - lobby.depth / 2 - corridor.depth / 2;
  return corridorZ - corridor.depth / 2 - room.depth / 2;
}

/** World origin — center of the full lobby+corridor+office footprint. */
export function interiorSceneFocusZ(): number {
  return 0;
}

export type InteriorFrustumFocus = "office" | "full";

export function defaultInteriorFrustum(
  office: OfficeVisualConfig,
  focus: InteriorFrustumFocus = "office",
): number {
  if (focus === "office") {
    const span = Math.max(office.room.width, office.room.depth);
    return Math.max(2.8, span * 0.82);
  }
  const maxW = Math.max(office.room.width, office.lobby_room.width, office.corridor_room.width);
  const totalD = office.lobby_room.depth + office.corridor_room.depth + office.room.depth;
  const span = Math.max(maxW, totalD * 0.55);
  return Math.max(5.4, span * 0.52);
}

export const INTERIOR_ZOOM_MIN = 0.35;
export const INTERIOR_ZOOM_MAX = 1.75;

export function clampInteriorZoom(zoom: number): number {
  return Math.max(INTERIOR_ZOOM_MIN, Math.min(INTERIOR_ZOOM_MAX, zoom));
}

export function interiorFrustumForOrbit(office: OfficeVisualConfig, orbit: InteriorOrbitState): number {
  const base = defaultInteriorFrustum(office, "full");
  return base / orbit.zoom;
}

/** Default orbit when entering a building in play mode — wider than design-studio close-up. */
export function createGameInteriorOrbit(office: OfficeVisualConfig): InteriorOrbitState {
  return {
    dragging: false,
    lastX: 0,
    lastY: 0,
    azimuth: ISO_SNAP,
    elevation: 0.48,
    frustum: defaultInteriorFrustum(office, "full"),
    zoom: 0.5,
    panX: 0,
    panZ: 0,
  };
}

export function applyInteriorPan(
  orbit: InteriorOrbitState,
  dx: number,
  dy: number,
  viewWidth: number,
  frustum: number,
): void {
  const sensitivity = (frustum / Math.max(viewWidth, 320)) * 1.35;
  const cos = Math.cos(orbit.azimuth);
  const sin = Math.sin(orbit.azimuth);
  orbit.panX -= (dx * cos + dy * sin) * sensitivity;
  orbit.panZ -= (-dx * sin + dy * cos) * sensitivity;
}

const ISO_SNAP = Math.PI / 4;

export function snapIsometricAzimuth(azimuth: number): number {
  return Math.round(azimuth / ISO_SNAP) * ISO_SNAP;
}

export function createDefaultOrbit(office: OfficeVisualConfig): InteriorOrbitState {
  return {
    dragging: false,
    lastX: 0,
    lastY: 0,
    azimuth: ISO_SNAP,
    elevation: 0.58,
    frustum: defaultInteriorFrustum(office, "office"),
    zoom: 1,
    panX: 0,
    panZ: 0,
  };
}

export const STUDIO_PERSPECTIVE_FOV = 42;

export function applyOrbitToPerspectiveCamera(
  camera: THREE.PerspectiveCamera,
  orbit: InteriorOrbitState,
  lookAtZ: number = interiorSceneFocusZ(),
): void {
  const dist = 9.2 / orbit.zoom;
  const focusX = orbit.panX;
  const focusZ = lookAtZ + orbit.panZ;
  const x = focusX + Math.cos(orbit.azimuth) * dist;
  const z = focusZ + Math.sin(orbit.azimuth) * dist;
  const y = 2.8 + orbit.elevation * 5.2;
  camera.position.set(x, y, z);
  camera.lookAt(focusX, 1.05, focusZ);
}

export function applyOrbitToCamera(
  camera: THREE.OrthographicCamera,
  orbit: InteriorOrbitState,
  lookAtZ: number = interiorSceneFocusZ(),
): void {
  const dist = 6.8 / orbit.zoom;
  const focusX = orbit.panX;
  const focusZ = lookAtZ + orbit.panZ;
  const x = focusX + Math.cos(orbit.azimuth) * dist;
  const z = focusZ + Math.sin(orbit.azimuth) * dist;
  const y = 6.4 + orbit.elevation * 7.2;
  camera.position.set(x, y, z);
  camera.lookAt(focusX, 0.75, focusZ);
}

export function setOrthographicFrustum(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  frustum: number,
): void {
  const aspect = width / Math.max(height, 1);
  camera.left = (-frustum * aspect) / 2;
  camera.right = (frustum * aspect) / 2;
  camera.top = frustum / 2;
  camera.bottom = -frustum / 2;
  camera.updateProjectionMatrix();
}

export function lerpGameInteriorCamera(
  camera: THREE.OrthographicCamera,
  _office: OfficeVisualConfig,
  orbit: InteriorOrbitState,
  transition: number,
  delta: number,
): number {
  const focusZ = interiorSceneFocusZ();
  const focusX = orbit.panX;
  const focusTargetZ = focusZ + orbit.panZ;
  const start = new THREE.Vector3(5.5, 7.2, 5.5 + focusZ);
  const dist = 6.8 / orbit.zoom;
  const end = new THREE.Vector3(
    focusX + Math.cos(orbit.azimuth) * dist,
    6.4 + orbit.elevation * 7.2,
    focusTargetZ + Math.sin(orbit.azimuth) * dist,
  );
  const nextT = Math.min(transition + delta * 2.5, 1);
  camera.position.lerpVectors(start, end, nextT);
  camera.lookAt(focusX, 0.75, focusTargetZ);
  return nextT;
}