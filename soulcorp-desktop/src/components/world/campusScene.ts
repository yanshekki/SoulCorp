import * as THREE from "three";
import { WORLD_PROPS } from "../../data/worldLayout";
import type { Building } from "../../types/world";
import type { BuildingVisualConfig, CampusThemeConfig } from "../../types/visualDesign";
import { AgentRenderSystem } from "./agentRenderSystem";
import {
  buildingVisualSignature,
  createStylizedBuilding,
  setBuildingHover,
  type StylizedBuildingParts,
} from "./stylizedBuilding";
import { createCampusProp } from "./campusPolish";
import {
  configureCozyRenderer,
  createCozyPostPipeline,
  type CozyPostPipeline,
} from "../../utils/cozyPostPipeline";
import {
  applyCampusTheme,
  createCampusPath,
  createCampusSky,
  createThemedGround,
  createThemeLights,
  isNightCampus,
  type ThemeHandles,
} from "./sceneTheme";

export interface CampusVisualStyle {
  cozyEffects: boolean;
  crtFilter: boolean;
}

export interface CampusSceneHandles {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  buildingParts: Map<string, StylizedBuildingParts>;
  agentRenderer: AgentRenderSystem;
  theme: ThemeHandles;
  resize: (width: number, height: number) => void;
  syncBuildings: (
    buildings: Building[],
    buildingConfigs: Record<string, BuildingVisualConfig>,
    campus: CampusThemeConfig,
    hoveredId: string | null,
  ) => void;
  syncTheme: (campus: CampusThemeConfig, lowPowerMode: boolean) => void;
  setVisualStyle: (style: Partial<CampusVisualStyle>) => void;
  renderFrame: () => void;
  raycastDoor: (normalizedX: number, normalizedY: number) => Building | null;
  raycastBuilding: (normalizedX: number, normalizedY: number) => Building | null;
  dispose: () => void;
}

function createPropInstances(scene: THREE.Scene, lowPowerShadows: boolean) {
  for (const prop of WORLD_PROPS) {
    scene.add(createCampusProp(prop, lowPowerShadows));
  }
}

export function createCampusScene(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  campus: CampusThemeConfig,
  lowPowerMode = false,
): CampusSceneHandles {
  const scene = new THREE.Scene();
  const aspect = width / Math.max(height, 1);
  const frustum = 14;
  const camera = new THREE.OrthographicCamera(
    (-frustum * aspect) / 2,
    (frustum * aspect) / 2,
    frustum / 2,
    -frustum / 2,
    0.1,
    500,
  );
  camera.position.set(14, 14, 14);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(lowPowerMode ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !lowPowerMode;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  configureCozyRenderer(renderer);

  let visualStyle: CampusVisualStyle = { cozyEffects: !lowPowerMode, crtFilter: false };
  const postPipeline: CozyPostPipeline = createCozyPostPipeline(
    renderer,
    scene,
    camera,
    width,
    height,
    { bloomStrength: 0.28, vignetteStrength: 0.3 },
  );
  postPipeline.setEnabled(visualStyle.cozyEffects);

  const skyDome = createCampusSky(campus);
  scene.add(skyDome);

  const groundMesh = createThemedGround(campus);
  scene.add(groundMesh);

  const pathMesh = createCampusPath();
  scene.add(pathMesh);

  createPropInstances(scene, lowPowerMode);

  const lights = createThemeLights(lowPowerMode);
  scene.add(lights.ambient, lights.hemisphere, lights.sun, lights.rim);

  const theme: ThemeHandles = {
    groundMesh,
    pathMesh,
    skyDome,
    ...lights,
  };
  applyCampusTheme(scene, renderer, campus, theme, lowPowerMode);

  const buildingParts = new Map<string, StylizedBuildingParts>();
  const signatures = new Map<string, string>();
  const agentRenderer = new AgentRenderSystem(scene);
  const raycaster = new THREE.Raycaster();

  const syncBuildings = (
    buildings: Building[],
    buildingConfigs: Record<string, BuildingVisualConfig>,
    nextCampus: CampusThemeConfig,
    hoveredId: string | null,
  ) => {
    const night = isNightCampus(nextCampus);
    const seen = new Set<string>();

    for (const building of buildings) {
      seen.add(building.id);
      const config = buildingConfigs[building.id];
      const signature = buildingVisualSignature(building, config);
      const existing = buildingParts.get(building.id);

      if (!existing || signatures.get(building.id) !== signature) {
        if (existing) {
          scene.remove(existing.group);
        }
        const parts = createStylizedBuilding(building, config, night);
        buildingParts.set(building.id, parts);
        signatures.set(building.id, signature);
        scene.add(parts.group);
      }

      const parts = buildingParts.get(building.id);
      if (parts) {
        setBuildingHover(parts, hoveredId === building.id);
      }
    }

    for (const [id, parts] of buildingParts) {
      if (!seen.has(id)) {
        scene.remove(parts.group);
        buildingParts.delete(id);
        signatures.delete(id);
      }
    }
  };

  return {
    scene,
    camera,
    renderer,
    buildingParts,
    agentRenderer,
    theme,
    resize(nextWidth: number, nextHeight: number) {
      const nextAspect = nextWidth / Math.max(nextHeight, 1);
      camera.left = (-frustum * nextAspect) / 2;
      camera.right = (frustum * nextAspect) / 2;
      camera.top = frustum / 2;
      camera.bottom = -frustum / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
      postPipeline.resize(nextWidth, nextHeight);
    },
    syncBuildings,
    syncTheme(nextCampus, nextLowPower) {
      applyCampusTheme(scene, renderer, nextCampus, theme, nextLowPower);
    },
    setVisualStyle(style) {
      const nextCozy = style.cozyEffects ?? visualStyle.cozyEffects;
      const nextCrt = style.crtFilter ?? visualStyle.crtFilter;
      visualStyle = { cozyEffects: nextCozy, crtFilter: nextCrt };
      postPipeline.setEnabled(nextCozy);
      postPipeline.setCrtEnabled(nextCrt);
    },
    renderFrame() {
      postPipeline.render();
    },
    raycastDoor(nx, ny) {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const doors = Array.from(buildingParts.values()).map((p) => p.door);
      const hits = raycaster.intersectObjects(doors, false);
      if (hits.length === 0) {
        return null;
      }
      const buildingId = hits[0].object.userData.buildingId as string;
      const parts = buildingParts.get(buildingId);
      return (parts?.group.userData.building as Building) ?? null;
    },
    raycastBuilding(nx, ny) {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const groups = Array.from(buildingParts.values()).map((p) => p.group);
      const hits = raycaster.intersectObjects(groups, true);
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (node.userData.building) {
            return node.userData.building as Building;
          }
          node = node.parent;
        }
      }
      return null;
    },
    dispose() {
      postPipeline.dispose();
      agentRenderer.dispose();
      renderer.dispose();
      scene.clear();
    },
  };
}