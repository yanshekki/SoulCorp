import { findPath } from "./pathfinding";
import type { NavGrid } from "./navGrid";

export function targetKey(target: [number, number, number]): string {
  return `${target[0].toFixed(2)},${target[2].toFixed(2)}`;
}

export function ensurePath(
  grid: NavGrid,
  position: [number, number, number],
  target: [number, number, number],
  currentPath: [number, number, number][] | undefined,
  currentTargetKey: string | undefined,
  currentPathIndex = 0,
): { path: [number, number, number][]; pathIndex: number; pathTargetKey: string } {
  const nextTargetKey = targetKey(target);
  if (currentPath && currentPath.length > 0 && currentTargetKey === nextTargetKey) {
    return {
      path: currentPath,
      pathIndex: Math.min(currentPathIndex, currentPath.length - 1),
      pathTargetKey: nextTargetKey,
    };
  }

  const found = findPath(grid, position, target);
  if (found && found.length > 0) {
    return { path: found, pathIndex: 0, pathTargetKey: nextTargetKey };
  }

  return { path: [target], pathIndex: 0, pathTargetKey: nextTargetKey };
}

export function followPath(
  position: [number, number, number],
  path: [number, number, number][],
  pathIndex: number,
  speed: number,
  delta: number,
): { position: [number, number, number]; pathIndex: number } {
  if (path.length === 0) {
    return { position, pathIndex };
  }

  let idx = Math.min(pathIndex, path.length - 1);
  let pos = position;
  let remaining = speed * delta;

  while (remaining > 0 && idx < path.length) {
    const waypoint = path[idx];
    const dx = waypoint[0] - pos[0];
    const dz = waypoint[2] - pos[2];
    const dist = Math.hypot(dx, dz);
    if (dist < 0.08) {
      idx += 1;
      pos = [waypoint[0], 0, waypoint[2]];
      continue;
    }
    if (dist <= remaining) {
      remaining -= dist;
      pos = [waypoint[0], 0, waypoint[2]];
      idx += 1;
      continue;
    }
    const step = remaining / dist;
    pos = [pos[0] + dx * step, 0, pos[2] + dz * step];
    remaining = 0;
  }

  return { position: pos, pathIndex: idx };
}