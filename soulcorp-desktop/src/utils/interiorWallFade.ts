import * as THREE from "three";
import type { InteriorZone } from "../types/visualDesign";

export type InteriorWallFace = "front" | "back" | "left" | "right";

/** playCozy / walk peel minimum (OFFICE_VISUAL_TARGET). */
export const WALL_PEEL_MIN_OPACITY = 0.22;

export interface InteriorWallFadeOptions {
  /** Walk mode peels obstructing walls faster and more aggressively. */
  walkPeel?: boolean;
}

const FACE_NORMALS: Record<InteriorWallFace, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, -1),
  back: new THREE.Vector3(0, 0, 1),
  left: new THREE.Vector3(1, 0, 0),
  right: new THREE.Vector3(-1, 0, 0),
};

export function tagInteriorWall(
  mesh: THREE.Mesh,
  zone: InteriorZone,
  face: InteriorWallFace,
): void {
  const source = mesh.material;
  if (!(source instanceof THREE.MeshStandardMaterial)) {
    return;
  }
  const material = source.clone();
  material.transparent = true;
  material.opacity = 0.92;
  mesh.material = material;
  mesh.userData.isInteriorWall = true;
  mesh.userData.wallZone = zone;
  mesh.userData.wallFace = face;
}

export function collectInteriorWalls(root: THREE.Object3D): THREE.Mesh[] {
  const walls: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.isInteriorWall === true) {
      walls.push(child);
    }
  });
  return walls;
}

export function updateInteriorWallFade(
  walls: THREE.Mesh[],
  camera: THREE.Camera,
  focus: THREE.Vector3,
  options: InteriorWallFadeOptions = {},
): void {
  const toFocus = focus.clone().sub(camera.position).normalize();
  const peelLerp = options.walkPeel ? 0.32 : 0.2;
  const obstructThreshold = options.walkPeel ? 0.02 : 0.08;

  for (const wall of walls) {
    const face = wall.userData.wallFace as InteriorWallFace | undefined;
    if (!face) {
      continue;
    }
    const normal = FACE_NORMALS[face];
    const obstructs = normal.dot(toFocus) > obstructThreshold;
    const targetOpacity = obstructs ? WALL_PEEL_MIN_OPACITY : 0.92;
    const material = wall.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) {
      continue;
    }
    material.opacity = THREE.MathUtils.lerp(material.opacity, targetOpacity, peelLerp);
    material.transparent = material.opacity < 0.98;
    material.depthWrite = material.opacity > 0.5;
  }
}