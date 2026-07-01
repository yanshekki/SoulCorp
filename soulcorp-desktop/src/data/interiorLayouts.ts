import { defaultBuildingForId, roomsFromBuilding } from "../utils/interiorScale";

export type InteriorZone = "lobby" | "office";

export interface InteriorLayout {
  lobbySize: [number, number];
  officeSize: [number, number];
  exitDoor: [number, number, number];
  receptionDesk: [number, number, number];
  logoWall: [number, number, number];
  corridorEnd: [number, number, number];
}

function layoutFromBuilding(buildingId: string): InteriorLayout {
  const building = defaultBuildingForId(buildingId);
  const rooms = roomsFromBuilding(building);
  const lobbyDepth = rooms.lobby_room.depth;
  const lobbyHalf = lobbyDepth / 2;
  return {
    lobbySize: [rooms.lobby_room.width, rooms.lobby_room.depth],
    officeSize: [rooms.room.width, rooms.room.depth],
    exitDoor: [0, 0, lobbyHalf - 0.15],
    receptionDesk: [0, 0, lobbyHalf - 0.95],
    logoWall: [0, 1.25, -lobbyHalf + 0.45],
    corridorEnd: [0, 0, -lobbyHalf - rooms.corridor_room.depth * 0.45],
  };
}

export const INTERIOR_LAYOUTS: Record<string, InteriorLayout> = {
  hq: layoutFromBuilding("hq"),
  engineering: layoutFromBuilding("engineering"),
  hr: layoutFromBuilding("hr"),
  plaza: layoutFromBuilding("plaza"),
  park: layoutFromBuilding("park"),
};

export function layoutForBuilding(buildingId: string): InteriorLayout {
  return INTERIOR_LAYOUTS[buildingId] ?? layoutFromBuilding(buildingId);
}