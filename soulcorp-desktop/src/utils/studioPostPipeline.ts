import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export interface StudioPostPipeline {
  composer: EffectComposer;
  resize: (width: number, height: number) => void;
  render: () => void;
  setCamera: (camera: THREE.Camera) => void;
  dispose: () => void;
}

/** Design studio clarity: SSAO + subtle bloom, no vignette/CRT (Phase B4). */
export function createStudioClarityPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): StudioPostPipeline {
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(renderer.getPixelRatio());

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new SSAOPass(scene, camera, width, height, 24);
  ssaoPass.kernelRadius = 6;
  ssaoPass.minDistance = 0.004;
  ssaoPass.maxDistance = 0.09;
  composer.addPass(ssaoPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.12, 0.32, 0.9);
  composer.addPass(bloomPass);

  return {
    composer,
    resize(nextWidth, nextHeight) {
      composer.setSize(nextWidth, nextHeight);
      ssaoPass.setSize(nextWidth, nextHeight);
      bloomPass.resolution.set(nextWidth, nextHeight);
    },
    render() {
      composer.render();
    },
    setCamera(nextCamera) {
      renderPass.camera = nextCamera;
      ssaoPass.camera = nextCamera;
    },
    dispose() {
      composer.dispose();
    },
  };
}