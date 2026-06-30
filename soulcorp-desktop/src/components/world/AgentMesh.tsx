import type { Agent } from "../../types/world";

interface AgentMeshProps {
  agent: Agent;
}

export function AgentMesh({ agent }: AgentMeshProps) {
  const rotation = Math.atan2(
    agent.target[0] - agent.position[0],
    agent.target[2] - agent.position[2],
  );

  return (
    <group position={agent.position} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.28, 0.55, 6, 10]} />
        <meshStandardMaterial color={agent.color} />
      </mesh>
    </group>
  );
}