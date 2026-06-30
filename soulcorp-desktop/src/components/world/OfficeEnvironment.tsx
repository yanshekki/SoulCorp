import { WORLD_PROPS } from "../../data/worldLayout";

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 0.7, 8]} />
        <meshStandardMaterial color="#6d4c35" />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <coneGeometry args={[0.55, 1.1, 8]} />
        <meshStandardMaterial color="#4f8a57" />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <coneGeometry args={[0.38, 0.7, 8]} />
        <meshStandardMaterial color="#6daa62" />
      </mesh>
    </group>
  );
}

function Bench({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.42]} />
        <meshStandardMaterial color="#8b6f5c" />
      </mesh>
      <mesh position={[-0.45, 0.12, 0]} castShadow>
        <boxGeometry args={[0.08, 0.24, 0.36]} />
        <meshStandardMaterial color="#6d5645" />
      </mesh>
      <mesh position={[0.45, 0.12, 0]} castShadow>
        <boxGeometry args={[0.08, 0.24, 0.36]} />
        <meshStandardMaterial color="#6d5645" />
      </mesh>
    </group>
  );
}

function Lamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 1.4, 8]} />
        <meshStandardMaterial color="#4a4a4a" />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color="#ffe6a8" emissive="#ffcc66" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function Planter({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.35, 0.9]} />
        <meshStandardMaterial color="#8b5a43" />
      </mesh>
      <mesh position={[0, 0.45, 0]} castShadow>
        <sphereGeometry args={[0.42, 10, 10]} />
        <meshStandardMaterial color="#6fae63" />
      </mesh>
    </group>
  );
}

export function OfficeEnvironment() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 1.5]} receiveShadow>
        <planeGeometry args={[3.5, 14]} />
        <meshStandardMaterial color="#c7b08a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4.5, 0.01, 2]} receiveShadow>
        <planeGeometry args={[5, 4]} />
        <meshStandardMaterial color="#c7b08a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4.8, 0.01, -1]} receiveShadow>
        <planeGeometry args={[4.5, 4]} />
        <meshStandardMaterial color="#c7b08a" />
      </mesh>

      {WORLD_PROPS.map((prop) => {
        if (prop.type === "tree") {
          return <Tree key={prop.id} position={prop.position} scale={prop.scale} />;
        }
        if (prop.type === "bench") {
          return <Bench key={prop.id} position={prop.position} rotation={prop.rotation} />;
        }
        if (prop.type === "lamp") {
          return <Lamp key={prop.id} position={prop.position} />;
        }
        return <Planter key={prop.id} position={prop.position} />;
      })}
    </group>
  );
}