import * as THREE from "three";
import type { OfficeVisualConfig, OfficeLighting } from "../types/visualDesign";
import { boostColor } from "../components/world/campusPolish";

export interface InteriorLightingPreset {
  ambientIntensity: number;
  keyIntensity: number;
  keyColor: number;
  zoneLightIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
}

export function interiorLightingPreset(lighting: OfficeLighting): InteriorLightingPreset {
  switch (lighting) {
    case "warm":
      return {
        ambientIntensity: 0.72,
        keyIntensity: 1.18,
        keyColor: 0xfff0d8,
        zoneLightIntensity: 1.15,
        hemisphereSky: 0xfff4e8,
        hemisphereGround: 0xc4a574,
      };
    case "cool":
      return {
        ambientIntensity: 0.64,
        keyIntensity: 1.02,
        keyColor: 0xd8ecff,
        zoneLightIntensity: 0.95,
        hemisphereSky: 0xd8ecff,
        hemisphereGround: 0x8a9ab0,
      };
    default:
      return {
        ambientIntensity: 0.68,
        keyIntensity: 1.1,
        keyColor: 0xffffff,
        zoneLightIntensity: 1.05,
        hemisphereSky: 0xf4f8ff,
        hemisphereGround: 0xb8a88a,
      };
  }
}

export { configureCozyRenderer as configureInteriorRenderer } from "./cozyPostPipeline";

export function applyInteriorScenePolish(scene: THREE.Scene, office: OfficeVisualConfig): void {
  const base = office.floor_color || "#e8e0d4";
  const polished = boostColor(base, 1.1, 1.03);
  scene.background = polished;
  // Interior rooms are small — distance fog at 10–22m washes out the whole scene.
  scene.fog = null;
}