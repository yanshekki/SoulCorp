import type * as THREE from "three";
import {
  createCozyPostPipeline,
  type CozyPostPipeline,
} from "./cozyPostPipeline";
import { createStudioClarityPostPipeline, type StudioPostPipeline } from "./studioPostPipeline";

export type InteriorPostPipeline = CozyPostPipeline | StudioPostPipeline;

export function createInteriorPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): CozyPostPipeline {
  return createCozyPostPipeline(renderer, scene, camera, width, height);
}

export function createStudioInteriorPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): StudioPostPipeline {
  return createStudioClarityPostPipeline(renderer, scene, camera, width, height);
}