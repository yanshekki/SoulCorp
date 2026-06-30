import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useGameStore } from "../stores/gameStore";
import type { Agent } from "../types/world";

interface AgentSpriteProps {
  agents: Agent[];
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();
const cameraPosition = new THREE.Vector3();

export function AgentSprite({ agents }: AgentSpriteProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lowPowerMode = useGameStore((state) => state.settings.low_power_mode);
  const { camera } = useThree();
  const frameSkip = useRef(0);

  const geometry = useMemo(
    () =>
      new THREE.CapsuleGeometry(
        0.25,
        0.5,
        lowPowerMode ? 3 : 4,
        lowPowerMode ? 6 : 8,
      ),
    [lowPowerMode],
  );

  const colors = useMemo(
    () => agents.map((agent) => new THREE.Color(agent.color)),
    [agents],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.count = agents.length;
    agents.forEach((agent, index) => {
      tempObject.position.set(...agent.position);
      tempObject.rotation.y = Math.atan2(
        agent.target[0] - agent.position[0],
        agent.target[2] - agent.position[2],
      );
      tempObject.scale.setScalar(1);
      tempObject.updateMatrix();
      mesh.setMatrixAt(index, tempObject.matrix);
      mesh.setColorAt(index, colors[index] ?? tempColor.set(agent.color));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [agents, colors]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    frameSkip.current += 1;
    if (lowPowerMode && frameSkip.current % 2 !== 0) {
      return;
    }

    camera.getWorldPosition(cameraPosition);

    agents.forEach((agent, index) => {
      tempObject.position.set(...agent.position);
      tempObject.rotation.y = Math.atan2(
        agent.target[0] - agent.position[0],
        agent.target[2] - agent.position[2],
      );

      const distance = cameraPosition.distanceTo(tempObject.position);
      const scale = lowPowerMode
        ? distance > 14
          ? 0.65
          : 1
        : distance > 18
          ? 0.75
          : 1;
      tempObject.scale.setScalar(scale);
      tempObject.updateMatrix();
      mesh.setMatrixAt(index, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geometry, undefined, Math.max(agents.length, 1)]}
        castShadow={!lowPowerMode}
      >
        <meshStandardMaterial vertexColors toneMapped={false} />
      </instancedMesh>
      {agents.map((agent) => {
        const distance = cameraPosition.distanceTo(
          new THREE.Vector3(...agent.position),
        );
        if (lowPowerMode && distance > 12) {
          return null;
        }

        return (
          <Html
            key={agent.id}
            position={[agent.position[0], agent.position[1] + 1.1, agent.position[2]]}
            center
            distanceFactor={14}
            style={{ pointerEvents: "none" }}
          >
            <div className="agent-bubble">
              <strong>{agent.name}</strong>
              <span>{agent.statusLabel}</span>
            </div>
          </Html>
        );
      })}
    </group>
  );
}