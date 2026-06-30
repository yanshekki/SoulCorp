import type { Building } from "../types/world";

export const DEPARTMENT_BUILDING: Record<string, string> = {
  Engineering: "engineering",
  "Human Resources": "hr",
  Executive: "hq",
  Marketplace: "plaza",
  Recreation: "park",
};

export const BUILDING_DESKS: Record<string, [number, number, number][]> = {
  hq: [
    [-1.2, 0, 1.4],
    [1.1, 0, 1.2],
    [0.2, 0, -1.3],
  ],
  engineering: [
    [-7.2, 0, 2.8],
    [-5.4, 0, 3.2],
    [-6.8, 0, 0.8],
    [-4.8, 0, 1.4],
  ],
  hr: [
    [5.2, 0, -1.4],
    [7.0, 0, -2.6],
    [6.4, 0, -0.6],
  ],
  plaza: [
    [-1.4, 0, -6.2],
    [1.5, 0, -6.8],
    [0.3, 0, -8.0],
  ],
  park: [
    [7.8, 0, 4.0],
    [9.2, 0, 5.2],
    [8.4, 0, 6.0],
    [9.8, 0, 3.6],
  ],
};

export const BUILDING_ENTRANCES: Record<string, [number, number, number]> = {
  hq: [0, 0, 2.8],
  engineering: [-6, 0, 4.2],
  hr: [6, 0, -0.4],
  plaza: [0, 0, -5.2],
  park: [8.5, 0, 6.2],
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
  const desks = BUILDING_DESKS[buildingId] ?? BUILDING_DESKS.hq;
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