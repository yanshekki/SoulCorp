import type { FurnitureInstance, OfficeVisualConfig } from "../types/visualDesign";

export interface FurnitureSceneDiff {
  added: FurnitureInstance[];
  removedIds: string[];
  /** Position, rotation, or scale changed — update mesh transform in place. */
  transformUpdated: FurnitureInstance[];
  /** Catalog or zone changed — remove mesh and recreate. */
  recreated: FurnitureInstance[];
  unchangedIds: string[];
}

function transformKey(item: FurnitureInstance): string {
  return JSON.stringify({
    catalog_id: item.catalog_id,
    zone: item.zone,
    position: item.position,
    rotation_y: item.rotation_y,
    scale: item.scale ?? null,
  });
}

export function furnitureTransformsEqual(a: FurnitureInstance, b: FurnitureInstance): boolean {
  return a.id === b.id && transformKey(a) === transformKey(b);
}

export function needsFurnitureRecreate(prev: FurnitureInstance, next: FurnitureInstance): boolean {
  return prev.catalog_id !== next.catalog_id || prev.zone !== next.zone;
}

export function diffFurnitureScene(
  previous: FurnitureInstance[],
  next: FurnitureInstance[],
): FurnitureSceneDiff {
  const prevById = new Map(previous.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));

  const removedIds: string[] = [];
  const added: FurnitureInstance[] = [];
  const transformUpdated: FurnitureInstance[] = [];
  const recreated: FurnitureInstance[] = [];
  const unchangedIds: string[] = [];

  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      removedIds.push(id);
    }
  }

  for (const [id, item] of nextById) {
    const prev = prevById.get(id);
    if (!prev) {
      added.push(item);
      continue;
    }
    if (furnitureTransformsEqual(prev, item)) {
      unchangedIds.push(id);
      continue;
    }
    if (needsFurnitureRecreate(prev, item)) {
      recreated.push(item);
    } else {
      transformUpdated.push(item);
    }
  }

  return { added, removedIds, transformUpdated, recreated, unchangedIds };
}

export function furnitureDiffIsEmpty(diff: FurnitureSceneDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removedIds.length === 0 &&
    diff.transformUpdated.length === 0 &&
    diff.recreated.length === 0
  );
}

/** Shell / room fields that require a full interior rebuild when changed. */
export function officeShellFingerprint(office: OfficeVisualConfig): string {
  return JSON.stringify({
    theme_pack: office.theme_pack,
    floor_color: office.floor_color,
    wall_color: office.wall_color,
    accent_color: office.accent_color,
    lighting: office.lighting,
    desk_style: office.desk_style,
    lobby_room: office.lobby_room,
    corridor_room: office.corridor_room,
    room: office.room,
    has_plants: office.has_plants,
    has_whiteboard: office.has_whiteboard,
    has_lounge_seating: office.has_lounge_seating,
  });
}