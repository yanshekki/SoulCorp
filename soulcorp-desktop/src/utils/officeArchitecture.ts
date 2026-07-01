import * as THREE from "three";
import type { FloorPlanLayout } from "./furnitureEditor";
import { floorPlanLayout } from "./furnitureEditor";
import { snapScalar } from "./furnitureEditor";
import type {
  OfficeArchitecture,
  OfficeVisualConfig,
  OfficeWallSegment,
} from "../types/visualDesign";
import { OFFICE_ARCHITECTURE_FLOOR_MAX, OFFICE_ARCHITECTURE_FLOOR_MIN } from "../types/visualDesign";
import { createWallPlasterMaterial } from "./roomKitTextures";
import { tagInteriorWall } from "./interiorWallFade";

export const WALL_DRAW_GRID = 0.5;
export const WALL_SEGMENT_MIN_LENGTH = 0.5;
export const WALL_SEGMENT_MAX_LENGTH = 24;
const WALL_THICKNESS = 0.12;

export function normalizeOfficeArchitecture(
  raw: Partial<OfficeArchitecture> | undefined,
): OfficeArchitecture {
  const floorCount = Math.max(
    OFFICE_ARCHITECTURE_FLOOR_MIN,
    Math.min(OFFICE_ARCHITECTURE_FLOOR_MAX, Math.round(raw?.floor_count ?? 1)),
  );
  const walls = (raw?.walls ?? [])
    .map((segment) => normalizeWallSegment(segment, floorCount))
    .filter((segment): segment is OfficeWallSegment => segment !== null);
  return {
    freeform_enabled: raw?.freeform_enabled === true,
    floor_count: floorCount,
    walls,
  };
}

function normalizeWallSegment(
  raw: Partial<OfficeWallSegment>,
  floorCount: number,
): OfficeWallSegment | null {
  if (!raw.id || !raw.start || !raw.end) {
    return null;
  }
  const floor = Math.max(0, Math.min(floorCount - 1, Math.round(raw.floor ?? 0)));
  const start = snapWallPoint(raw.start[0], raw.start[1]);
  const end = snapWallPoint(raw.end[0], raw.end[1]);
  const length = wallSegmentLength(start, end);
  if (length < WALL_SEGMENT_MIN_LENGTH || length > WALL_SEGMENT_MAX_LENGTH) {
    return null;
  }
  return { id: raw.id, floor, start, end };
}

export function officeArchitecture(office: OfficeVisualConfig): OfficeArchitecture {
  return normalizeOfficeArchitecture(office.architecture);
}

export function snapWallPoint(planX: number, planY: number): [number, number] {
  return [snapScalar(planX, WALL_DRAW_GRID), snapScalar(planY, WALL_DRAW_GRID)];
}

export function wallSegmentLength(
  start: [number, number],
  end: [number, number],
): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

export function wallsOnFloor(
  architecture: OfficeArchitecture,
  floor: number,
): OfficeWallSegment[] {
  return architecture.walls.filter((segment) => segment.floor === floor);
}

export function planToWorldXZ(
  planX: number,
  planY: number,
  layout: FloorPlanLayout,
): { x: number; z: number } {
  return {
    x: planX - layout.maxWidth / 2,
    z: layout.totalDepth / 2 - planY,
  };
}

export function floorStackHeight(office: OfficeVisualConfig): number {
  return office.room.height;
}

export function createWallSegmentId(): string {
  return `wall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createWallSegment(
  floor: number,
  start: [number, number],
  end: [number, number],
): OfficeWallSegment | null {
  const snappedStart = snapWallPoint(start[0], start[1]);
  const snappedEnd = snapWallPoint(end[0], end[1]);
  const length = wallSegmentLength(snappedStart, snappedEnd);
  if (length < WALL_SEGMENT_MIN_LENGTH) {
    return null;
  }
  return {
    id: createWallSegmentId(),
    floor,
    start: snappedStart,
    end: snappedEnd,
  };
}

function buildWallMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  height: number,
  yBase: number,
  material: THREE.MeshStandardMaterial,
  floor: number,
): THREE.Mesh {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, height, WALL_THICKNESS),
    material,
  );
  mesh.position.set(
    (start.x + end.x) / 2,
    yBase + height / 2,
    (start.z + end.z) / 2,
  );
  mesh.rotation.y = Math.atan2(dz, dx);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tagInteriorWall(mesh, "office", "front");
  mesh.userData.architectureWall = true;
  mesh.userData.architectureFloor = floor;
  return mesh;
}

/** Builds freeform wall meshes for all architecture floors (stacked vertically). */
export function buildFreeformArchitectureGroup(office: OfficeVisualConfig): THREE.Group | null {
  const architecture = officeArchitecture(office);
  if (!architecture.freeform_enabled || architecture.walls.length === 0) {
    return null;
  }

  const layout = floorPlanLayout(office);
  const floorHeight = floorStackHeight(office);
  const group = new THREE.Group();
  group.name = "freeform-architecture";
  const material = createWallPlasterMaterial(office.wall_color);

  for (const segment of architecture.walls) {
    const startWorld = planToWorldXZ(segment.start[0], segment.start[1], layout);
    const endWorld = planToWorldXZ(segment.end[0], segment.end[1], layout);
    const yBase = segment.floor * floorHeight;
    const wall = buildWallMesh(
      new THREE.Vector3(startWorld.x, 0, startWorld.z),
      new THREE.Vector3(endWorld.x, 0, endWorld.z),
      floorHeight,
      yBase,
      material,
      segment.floor,
    );
    group.add(wall);
  }

  return group;
}

export function architectureFootprintArea(office: OfficeVisualConfig): number {
  const layout = floorPlanLayout(office);
  return layout.maxWidth * layout.totalDepth * officeArchitecture(office).floor_count;
}