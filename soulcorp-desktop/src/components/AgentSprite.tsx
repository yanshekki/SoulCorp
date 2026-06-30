import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { Agent } from "../types/world";

interface AgentSpriteProps {
  agents: Agent[];
}

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

export function AgentSprite({ agents }: AgentSpriteProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

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

    agents.forEach((agent, index) => {
      tempObject.position.set(...agent.position);
      tempObject.rotation.y = Math.atan2(
        agent.target[0] - agent.position[0],
        agent.target[2] - agent.position[2],
      );
      tempObject.updateMatrix();
      mesh.setMatrixAt(index, tempObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, agents.length]}>
        <capsuleGeometry args={[0.25, 0.5, 4, 8]} />
        <meshStandardMaterial vertexColors toneMapped={false} />
      </instancedMesh>
      {agents.map((agent) => (
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
      ))}
    </group>
  );
}