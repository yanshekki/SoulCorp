import { WAYPOINTS } from "../data/initialWorld";
import type { Agent } from "../types/world";

function distance2D(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function moveTowards(
  position: [number, number, number],
  target: [number, number, number],
  speed: number,
  delta: number,
): [number, number, number] {
  const dx = target[0] - position[0];
  const dz = target[2] - position[2];
  const dist = Math.hypot(dx, dz);

  if (dist < 0.05) {
    return [target[0], target[1], target[2]];
  }

  const step = Math.min(dist, speed * delta);
  const nx = position[0] + (dx / dist) * step;
  const nz = position[2] + (dz / dist) * step;
  const bob = Math.sin(performance.now() * 0.01) * 0.05;

  return [nx, 0.6 + bob, nz];
}

function nextWaypoint(current: [number, number, number]): [number, number, number] {
  const options = WAYPOINTS.filter((point) => distance2D(point, current) > 0.5);
  if (options.length === 0) {
    return WAYPOINTS[0];
  }
  return options[Math.floor(Math.random() * options.length)];
}

export function advanceAgents(agents: Agent[], delta: number): Agent[] {
  return agents.map((agent) => {
    const position = moveTowards(agent.position, agent.target, agent.speed, delta);
    const reached = distance2D(position, agent.target) < 0.1;
    const target = reached ? nextWaypoint(position) : agent.target;

    return {
      ...agent,
      position,
      target,
      status: reached ? "idle" : "walking",
    };
  });
}