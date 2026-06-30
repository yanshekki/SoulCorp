import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Agent, HairStyle } from "../../types/world";
import { NameSprite } from "./NameSprite";

interface HumanoidCharacterProps {
  agent: Agent;
}

function HairMesh({ style, color }: { style: HairStyle; color: string }) {
  if (style === "spiky") {
    return (
      <group position={[0, 1.52, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.42, 0.18, 0.42]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0.12, 0.2, 0]}>
          <boxGeometry args={[0.12, 0.16, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[-0.12, 0.18, 0.04]}>
          <boxGeometry args={[0.12, 0.14, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    );
  }

  if (style === "long") {
    return (
      <mesh position={[0, 1.45, -0.04]}>
        <boxGeometry args={[0.44, 0.42, 0.36]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }

  if (style === "bob") {
    return (
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.46, 0.24, 0.44]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }

  return (
    <mesh position={[0, 1.52, 0]}>
      <boxGeometry args={[0.4, 0.16, 0.4]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export function HumanoidCharacter({ agent }: HumanoidCharacterProps) {
  const rootRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  const { appearance } = agent;
  const scale = appearance.height;
  const width = appearance.build;

  useFrame(() => {
    const walking = agent.status === "walking";
    const phase = agent.walkPhase;
    const swing = walking ? Math.sin(phase) * 0.55 : 0;
    const bob = walking ? Math.abs(Math.sin(phase)) * 0.05 : 0;

    if (rootRef.current) {
      rootRef.current.position.y = bob;
      rootRef.current.rotation.y = Math.atan2(
        agent.target[0] - agent.position[0],
        agent.target[2] - agent.position[2],
      );
    }
    if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
    if (leftArmRef.current) leftArmRef.current.rotation.x = -swing * 0.8;
    if (rightArmRef.current) rightArmRef.current.rotation.x = swing * 0.8;
  });

  return (
    <group ref={rootRef} position={agent.position} scale={[width, scale, width]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.34, 0.42, 24]} />
        <meshBasicMaterial color={agent.color} transparent opacity={0.55} />
      </mesh>

      <group>
        <mesh position={[0, 1.35, 0]} castShadow>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color={appearance.skinColor} />
        </mesh>
        <HairMesh style={appearance.hairStyle} color={appearance.hairColor} />

        <mesh position={[0, 0.82, 0]} castShadow>
          <boxGeometry args={[0.42, 0.55, 0.24]} />
          <meshStandardMaterial color={appearance.shirtColor} />
        </mesh>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.36, 0.32, 0.22]} />
          <meshStandardMaterial color={appearance.pantsColor} />
        </mesh>

        <group ref={leftArmRef} position={[-0.28, 0.92, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <boxGeometry args={[0.1, 0.36, 0.1]} />
            <meshStandardMaterial color={appearance.shirtColor} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.28, 0.92, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <boxGeometry args={[0.1, 0.36, 0.1]} />
            <meshStandardMaterial color={appearance.shirtColor} />
          </mesh>
        </group>

        <group ref={leftLegRef} position={[-0.1, 0.34, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <boxGeometry args={[0.12, 0.36, 0.12]} />
            <meshStandardMaterial color={appearance.pantsColor} />
          </mesh>
          <mesh position={[0, -0.38, 0.04]} castShadow>
            <boxGeometry args={[0.14, 0.08, 0.22]} />
            <meshStandardMaterial color={appearance.shoeColor} />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.1, 0.34, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <boxGeometry args={[0.12, 0.36, 0.12]} />
            <meshStandardMaterial color={appearance.pantsColor} />
          </mesh>
          <mesh position={[0, -0.38, 0.04]} castShadow>
            <boxGeometry args={[0.14, 0.08, 0.22]} />
            <meshStandardMaterial color={appearance.shoeColor} />
          </mesh>
        </group>
      </group>

      <NameSprite name={agent.name} status={agent.statusLabel} />
    </group>
  );
}