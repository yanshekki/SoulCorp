import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const CozyGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignetteStrength: { value: 0.34 },
    saturation: { value: 1.12 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignetteStrength;
    uniform float saturation;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luma), color, saturation);
      float dist = distance(vUv, vec2(0.5));
      float vignette = 1.0 - vignetteStrength * smoothstep(0.28, 0.82, dist);
      gl_FragColor = vec4(color * vignette, texel.a);
    }
  `,
};

const CrtShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    crtStrength: { value: 0.55 },
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float crtStrength;
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - vec2(0.5);
      float aberration = crtStrength * 0.0018;
      float r = texture2D(tDiffuse, vUv + dir * aberration).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * aberration).b;
      vec3 color = vec3(r, g, b);
      float scan = sin((vUv.y + time * 0.02) * 720.0) * 0.5 + 0.5;
      color *= mix(1.0, scan, crtStrength * 0.12);
      float edge = smoothstep(0.46, 0.5, abs(vUv.x - 0.5)) + smoothstep(0.46, 0.5, abs(vUv.y - 0.5));
      color *= 1.0 - edge * crtStrength * 0.08;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export interface CozyPostOptions {
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  vignetteStrength?: number;
  saturation?: number;
}

export interface CozyPostPipeline {
  composer: EffectComposer;
  resize: (width: number, height: number) => void;
  render: () => void;
  setEnabled: (enabled: boolean) => void;
  setCrtEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

export function configureCozyRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createCozyPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  options: CozyPostOptions = {},
): CozyPostPipeline {
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);
  composer.setPixelRatio(renderer.getPixelRatio());

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    options.bloomStrength ?? 0.32,
    options.bloomRadius ?? 0.45,
    options.bloomThreshold ?? 0.82,
  );
  composer.addPass(bloomPass);

  const gradePass = new ShaderPass(CozyGradeShader);
  gradePass.uniforms.vignetteStrength.value = options.vignetteStrength ?? 0.34;
  gradePass.uniforms.saturation.value = options.saturation ?? 1.12;
  composer.addPass(gradePass);

  const crtPass = new ShaderPass(CrtShader);
  crtPass.enabled = false;
  composer.addPass(crtPass);

  let enabled = true;
  let time = 0;

  return {
    composer,
    resize(nextWidth, nextHeight) {
      composer.setSize(nextWidth, nextHeight);
      bloomPass.resolution.set(nextWidth, nextHeight);
    },
    render() {
      if (enabled) {
        time += 0.016;
        crtPass.uniforms.time.value = time;
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    },
    setEnabled(next) {
      enabled = next;
    },
    setCrtEnabled(next) {
      crtPass.enabled = next && enabled;
    },
    dispose() {
      composer.dispose();
    },
  };
}