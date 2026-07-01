import type * as THREE from "three";
import {
  createCozyPostPipeline,
  type CozyPostPipeline,
} from "./cozyPostPipeline";

export type InteriorPostPipeline = CozyPostPipeline;

export function createInteriorPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): InteriorPostPipeline {
  return createCozyPostPipeline(renderer, scene, camera, width, height);
}