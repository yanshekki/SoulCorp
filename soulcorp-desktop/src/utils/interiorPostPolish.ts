import * as THREE from "three";
import { getOfficeThemePack } from "../data/officeThemePacks";
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

/** B4 studioClarity — design studio viewport (SSAO + crisp walls). */
export function studioClarityLightingPreset(): InteriorLightingPreset {
  return {
    ambientIntensity: 0.78,
    keyIntensity: 1.2,
    keyColor: 0xfff0d8,
    zoneLightIntensity: 1.1,
    hemisphereSky: 0xfff4e8,
    hemisphereGround: 0xd4b896,
  };
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
  const theme = getOfficeThemePack(office.theme_pack);
  const base = theme.scene_background || office.floor_color || "#e8dfd2";
  const polished = boostColor(base, 1.08, 1.04);
  scene.background = polished;
  scene.fog = null;
}