import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { useGameStore } from "../../stores/gameStore";

const DEFAULT_POSITION = new THREE.Vector3(14, 14, 14);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

type OrbitControlsLike = {
  target: THREE.Vector3;
  update: () => void;
};

function asOrbitControls(controls: unknown): OrbitControlsLike | null {
  if (
    controls &&
    typeof controls === "object" &&
    "target" in controls &&
    "update" in controls
  ) {
    return controls as OrbitControlsLike;
  }
  return null;
}

export function CameraController() {
  const { camera, size, controls } = useThree();
  const selectedBuilding = useGameStore((state) => state.selectedBuilding);

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) {
      return;
    }

    const aspect =
      size.width > 0 && size.height > 0 ? size.width / size.height : 1;
    const frustumHeight = 14;
    camera.left = (-frustumHeight * aspect) / 2;
    camera.right = (frustumHeight * aspect) / 2;
    camera.top = frustumHeight / 2;
    camera.bottom = -frustumHeight / 2;
    camera.near = 0.1;
    camera.far = 500;
    camera.updateProjectionMatrix();
  }, [camera, size.height, size.width]);

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) {
      return;
    }

    camera.position.copy(DEFAULT_POSITION);
    const orbit = asOrbitControls(controls);
    if (orbit) {
      orbit.target.copy(DEFAULT_TARGET);
      orbit.update();
    } else {
      camera.lookAt(DEFAULT_TARGET);
    }
  }, [camera, controls]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.OrthographicCamera)) {
      return;
    }

    const orbit = asOrbitControls(controls);

    if (selectedBuilding) {
      const [x, , z] = selectedBuilding.position;
      const lookTarget = new THREE.Vector3(x, 0, z);
      const desiredPosition = new THREE.Vector3(x + 7, 10, z + 7);
      camera.position.lerp(desiredPosition, Math.min(delta * 2.5, 1));
      if (orbit) {
        orbit.target.lerp(lookTarget, Math.min(delta * 2.5, 1));
        orbit.update();
      } else {
        camera.lookAt(lookTarget);
      }
      return;
    }

    camera.position.lerp(DEFAULT_POSITION, Math.min(delta * 2, 1));
    if (orbit) {
      orbit.target.lerp(DEFAULT_TARGET, Math.min(delta * 2, 1));
      orbit.update();
    } else {
      camera.lookAt(DEFAULT_TARGET);
    }
  });

  return null;
}