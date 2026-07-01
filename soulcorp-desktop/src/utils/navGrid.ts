export interface NavGrid {
  cellSize: number;
  originX: number;
  originZ: number;
  width: number;
  height: number;
  walkable: Uint8Array;
  worldToCell: (x: number, z: number) => { cx: number; cz: number } | null;
  cellToWorld: (cx: number, cz: number) => [number, number, number];
  isWalkable: (cx: number, cz: number) => boolean;
  setWalkable: (cx: number, cz: number, value: boolean) => void;
}

export function createNavGrid(
  originX: number,
  originZ: number,
  width: number,
  height: number,
  cellSize: number,
  initialWalkable = true,
): NavGrid {
  const walkable = new Uint8Array(width * height);
  if (initialWalkable) {
    walkable.fill(1);
  }

  const index = (cx: number, cz: number) => cz * width + cx;

  return {
    cellSize,
    originX,
    originZ,
    width,
    height,
    walkable,
    worldToCell(x, z) {
      const cx = Math.floor((x - originX) / cellSize);
      const cz = Math.floor((z - originZ) / cellSize);
      if (cx < 0 || cz < 0 || cx >= width || cz >= height) {
        return null;
      }
      return { cx, cz };
    },
    cellToWorld(cx, cz) {
      return [
        originX + (cx + 0.5) * cellSize,
        0,
        originZ + (cz + 0.5) * cellSize,
      ];
    },
    isWalkable(cx, cz) {
      if (cx < 0 || cz < 0 || cx >= width || cz >= height) {
        return false;
      }
      return walkable[index(cx, cz)] === 1;
    },
    setWalkable(cx, cz, value) {
      if (cx < 0 || cz < 0 || cx >= width || cz >= height) {
        return;
      }
      walkable[index(cx, cz)] = value ? 1 : 0;
    },
  };
}

export function fillRectBlocked(
  grid: NavGrid,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): void {
  const start = grid.worldToCell(minX, minZ);
  const end = grid.worldToCell(maxX, maxZ);
  if (!start || !end) {
    return;
  }
  const minCx = Math.min(start.cx, end.cx);
  const maxCx = Math.max(start.cx, end.cx);
  const minCz = Math.min(start.cz, end.cz);
  const maxCz = Math.max(start.cz, end.cz);
  for (let cz = minCz; cz <= maxCz; cz += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      grid.setWalkable(cx, cz, false);
    }
  }
}

export function carveWalkableDisc(
  grid: NavGrid,
  x: number,
  z: number,
  radius: number,
): void {
  const cellRadius = Math.ceil(radius / grid.cellSize);
  const center = grid.worldToCell(x, z);
  if (!center) {
    return;
  }
  for (let dz = -cellRadius; dz <= cellRadius; dz += 1) {
    for (let dx = -cellRadius; dx <= cellRadius; dx += 1) {
      const cx = center.cx + dx;
      const cz = center.cz + dz;
      const [wx, , wz] = grid.cellToWorld(cx, cz);
      if (Math.hypot(wx - x, wz - z) <= radius) {
        grid.setWalkable(cx, cz, true);
      }
    }
  }
}