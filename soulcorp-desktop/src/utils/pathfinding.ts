import type { NavGrid } from "./navGrid";

const NEIGHBORS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
];

function cellKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function heuristic(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function nearestWalkable(
  grid: NavGrid,
  cx: number,
  cz: number,
): { cx: number; cz: number } | null {
  if (grid.isWalkable(cx, cz)) {
    return { cx, cz };
  }
  for (let radius = 1; radius <= 6; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nextCx = cx + dx;
        const nextCz = cz + dz;
        if (grid.isWalkable(nextCx, nextCz)) {
          return { cx: nextCx, cz: nextCz };
        }
      }
    }
  }
  return null;
}

export function findPath(
  grid: NavGrid,
  start: [number, number, number],
  goal: [number, number, number],
): [number, number, number][] | null {
  const startCell = grid.worldToCell(start[0], start[2]);
  const goalCell = grid.worldToCell(goal[0], goal[2]);
  if (!startCell || !goalCell) {
    return null;
  }

  const resolvedStart = nearestWalkable(grid, startCell.cx, startCell.cz);
  const resolvedGoal = nearestWalkable(grid, goalCell.cx, goalCell.cz);
  if (!resolvedStart || !resolvedGoal) {
    return null;
  }

  if (
    resolvedStart.cx === resolvedGoal.cx &&
    resolvedStart.cz === resolvedGoal.cz
  ) {
    return [grid.cellToWorld(resolvedGoal.cx, resolvedGoal.cz)];
  }

  const open = new Map<string, { cx: number; cz: number; f: number }>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();

  const startKey = cellKey(resolvedStart.cx, resolvedStart.cz);
  const goalKey = cellKey(resolvedGoal.cx, resolvedGoal.cz);
  gScore.set(startKey, 0);
  open.set(startKey, {
    cx: resolvedStart.cx,
    cz: resolvedStart.cz,
    f: heuristic(resolvedStart.cx, resolvedStart.cz, resolvedGoal.cx, resolvedGoal.cz),
  });

  let iterations = 0;
  const maxIterations = grid.width * grid.height * 4;

  while (open.size > 0 && iterations < maxIterations) {
    iterations += 1;
    let currentKey = "";
    let currentNode = { cx: 0, cz: 0, f: Number.POSITIVE_INFINITY };
    for (const [key, node] of open) {
      if (node.f < currentNode.f) {
        currentKey = key;
        currentNode = node;
      }
    }

    if (currentKey === goalKey) {
      const cells: { cx: number; cz: number }[] = [];
      let cursor: string | undefined = currentKey;
      while (cursor) {
        const [cx, cz] = cursor.split(",").map(Number);
        cells.push({ cx, cz });
        cursor = cameFrom.get(cursor);
      }
      cells.reverse();
      return cells.map(({ cx, cz }) => grid.cellToWorld(cx, cz));
    }

    open.delete(currentKey);
    const currentG = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY;

    for (const neighbor of NEIGHBORS) {
      const nextCx = currentNode.cx + neighbor.dx;
      const nextCz = currentNode.cz + neighbor.dz;
      if (!grid.isWalkable(nextCx, nextCz)) {
        continue;
      }
      if (neighbor.dx !== 0 && neighbor.dz !== 0) {
        if (
          !grid.isWalkable(currentNode.cx + neighbor.dx, currentNode.cz) ||
          !grid.isWalkable(currentNode.cx, currentNode.cz + neighbor.dz)
        ) {
          continue;
        }
      }

      const nextKey = cellKey(nextCx, nextCz);
      const tentativeG = currentG + neighbor.cost;
      if (tentativeG >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      cameFrom.set(nextKey, currentKey);
      gScore.set(nextKey, tentativeG);
      open.set(nextKey, {
        cx: nextCx,
        cz: nextCz,
        f: tentativeG + heuristic(nextCx, nextCz, resolvedGoal.cx, resolvedGoal.cz),
      });
    }
  }

  return null;
}