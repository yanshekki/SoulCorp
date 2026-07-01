import { useGameStore } from "../stores/gameStore";
import type { Building } from "../types/world";

export const DEPARTMENT_BUILDING: Record<string, string> = {
  Engineering: "engineering",
  "Human Resources": "hr",
  Executive: "hq",
  Meta: "hq",
  Marketplace: "plaza",
  Recreation: "park",
};

/** Legacy fallback — runtime uses furniture[] from HK layout (50 desks per building). */
export const BUILDING_DESKS: Record<string, [number, number, number][]> = {
  hq: [[-3.5, 0, 0]],
  engineering: [[-3.5, 0, 0]],
  hr: [[-3.5, 0, 0]],
  plaza: [[-3.5, 0, 0]],
  park: [[-3.5, 0, 0]],
};

export const BUILDING_ENTRANCES: Record<string, [number, number, number]> = {
  hq: [0, 0, 7.5],
  engineering: [-14, 0, 10.5],
  hr: [14, 0, -2.5],
  plaza: [0, 0, -10.5],
  park: [18, 0, 16.5],
};

export const BREAK_SPOT: [number, number, number] = [8.5, 0, 5.0];
export const MEETING_ROOM: [number, number, number] = [0.5, 0, -2.5];

export const WORLD_PROPS = [
  { id: "tree-1", type: "tree" as const, position: [-10, 0, -4] as [number, number, number], scale: 1.1 },
  { id: "tree-2", type: "tree" as const, position: [9, 0, 3] as [number, number, number], scale: 0.95 },
  { id: "tree-3", type: "tree" as const, position: [-8, 0, 6] as [number, number, number], scale: 1.2 },
  { id: "bench-1", type: "bench" as const, position: [2.8, 0, 5.2] as [number, number, number] },
  { id: "bench-2", type: "bench" as const, position: [4.8, 0, 3.8] as [number, number, number], rotation: 1.2 },
  { id: "lamp-1", type: "lamp" as const, position: [-2.5, 0, 5.8] as [number, number, number] },
  { id: "lamp-2", type: "lamp" as const, position: [2.5, 0, -4.5] as [number, number, number] },
  { id: "planter-1", type: "planter" as const, position: [-3.5, 0, -5.5] as [number, number, number] },
];

export function deskForAgent(buildingId: string, agentId: string): [number, number, number] {
  const office = useGameStore.getState().visualDesign.offices[buildingId];
  let desks: [number, number, number][] = BUILDING_DESKS[buildingId] ?? BUILDING_DESKS.hq;

  if (office) {
    const boundDesk = office.furniture?.find(
      (item) => item.catalog_id.startsWith("desk_") && item.linked_agent_id === agentId,
    );
    if (boundDesk) {
      return boundDesk.position;
    }

    const furnitureDesks =
      office.furniture?.filter((item) => item.catalog_id.startsWith("desk_")) ?? [];
    if (furnitureDesks.length > 0) {
      desks = furnitureDesks.map((item) => item.position);
    } else if (office.desk_positions && office.desk_positions.length > 0) {
      desks = office.desk_positions;
    }
  }

  let hash = 0;
  for (const char of agentId) {
    hash = (hash + char.charCodeAt(0) * 17) % desks.length;
  }
  return desks[hash] ?? desks[0];
}

export function buildingForDepartment(
  department: string,
  buildings: Building[],
): Building {
  const id = DEPARTMENT_BUILDING[department] ?? "hq";
  return buildings.find((building) => building.id === id) ?? buildings[0];
}