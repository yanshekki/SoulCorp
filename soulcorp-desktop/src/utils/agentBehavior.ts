import {
  BREAK_SPOT,
  buildingForDepartment,
  BUILDING_ENTRANCES,
  deskForAgent,
  DEPARTMENT_BUILDING,
  MEETING_ROOM,
} from "../data/worldLayout";
import type { AgentRecord } from "../types/game";
import type { Agent, AgentStatus, BehaviorIntent, Building } from "../types/world";
import { useGameStore } from "../stores/gameStore";
import { appearanceFromVisualConfig } from "./applyVisualDesign";
import { generateAgentAppearance } from "./agentAppearance";
import { hasMoraleDecorNearby } from "./furnitureInteractions";
import { normalizeOfficeVisual } from "./officeVisualNormalize";
import { getCampusNavGrid } from "./campusNavGrid";
import { ensurePath, followPath } from "./pathFollower";

const STATUS_LABELS: Record<BehaviorIntent, string> = {
  commute_to_desk: "Heading to desk",
  working: "Focused at workstation",
  walking_to_meeting: "Walking to meeting room",
  in_meeting: "In team meeting",
  walking_to_break: "Walking to break area",
  on_break: "Coffee break",
  walking_to_plaza: "Walking to Hub Plaza",
  visiting_plaza: "Checking marketplace board",
};

function distance2D(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function withY(point: [number, number, number], y = 0): [number, number, number] {
  return [point[0], y, point[2]];
}

function statusLabelFor(intent: BehaviorIntent, role: string): string {
  if (intent === "working") {
    return `${role} · deep work`;
  }
  return STATUS_LABELS[intent];
}

function mapBackendStatus(status: string): AgentStatus {
  if (status === "meeting") return "meeting";
  if (status === "throttled") return "working";
  if (status === "working") return "working";
  if (status === "walking") return "walking";
  return "idle";
}

function resolveBuildingId(department: string): string {
  return DEPARTMENT_BUILDING[department] ?? "hq";
}

export function isVisibleOfficeAgent(record: AgentRecord): boolean {
  return record.status !== "dormant";
}

export function createAgentFromRecord(record: AgentRecord): Agent {
  const buildingId = resolveBuildingId(record.department);
  const homeDesk = deskForAgent(buildingId, record.id);
  const entrance = BUILDING_ENTRANCES[buildingId] ?? homeDesk;
  const visualOverride = useGameStore.getState().visualDesign.agents[record.id];
  const appearance = visualOverride
    ? appearanceFromVisualConfig(record.id, visualOverride)
    : generateAgentAppearance(record.id);
  const isFate = record.agent_kind === "fate";

  return {
    id: record.id,
    name: record.name,
    department: record.department,
    role: record.role,
    color: isFate ? "#c9a227" : appearance.shirtColor,
    status: mapBackendStatus(record.status),
    statusLabel: statusLabelFor("commute_to_desk", record.role),
    position: withY(entrance),
    target: withY(homeDesk),
    speed: 1.05 + (hashString(record.id) % 7) * 0.04,
    appearance,
    behavior: {
      intent: "commute_to_desk",
      waitSeconds: 0,
      homeDesk: withY(homeDesk),
      buildingId,
    },
    walkPhase: 0,
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash + char.charCodeAt(0) * 13) % 997;
  }
  return hash;
}

function lunchWindow(tick: number): boolean {
  const dayMinute = tick % 480;
  return dayMinute >= 240 && dayMinute < 285;
}

function chooseNextIntent(
  agent: Agent,
  record: AgentRecord | undefined,
  tick: number,
): BehaviorIntent {
  if (record?.status === "meeting") {
    return agent.behavior.intent === "in_meeting" ? "in_meeting" : "walking_to_meeting";
  }

  if (lunchWindow(tick) && agent.department !== "Executive") {
    return agent.behavior.intent === "on_break" ? "on_break" : "walking_to_break";
  }

  if (
    agent.department === "Marketplace" &&
    agent.behavior.waitSeconds <= 0 &&
    tick % 90 === 0
  ) {
    return "walking_to_plaza";
  }

  return "working";
}

function targetForIntent(agent: Agent, intent: BehaviorIntent): [number, number, number] {
  switch (intent) {
    case "commute_to_desk":
    case "working":
      return agent.behavior.homeDesk;
    case "walking_to_meeting":
    case "in_meeting":
      return withY(MEETING_ROOM);
    case "walking_to_break":
    case "on_break":
      return withY(BREAK_SPOT);
    case "walking_to_plaza":
    case "visiting_plaza":
      return withY(BUILDING_ENTRANCES.plaza);
    default:
      return agent.behavior.homeDesk;
  }
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
  if (dist < 0.08) {
    return [target[0], 0, target[2]];
  }
  const step = Math.min(dist, speed * delta);
  return [position[0] + (dx / dist) * step, 0, position[2] + (dz / dist) * step];
}

export function advanceAgentBehavior(
  agent: Agent,
  record: AgentRecord | undefined,
  buildings: Building[],
  delta: number,
  tick: number,
): Agent {
  const building = buildingForDepartment(agent.department, buildings);
  if (agent.behavior.buildingId !== building.id) {
    const homeDesk = deskForAgent(building.id, agent.id);
    agent = {
      ...agent,
      behavior: {
        ...agent.behavior,
        buildingId: building.id,
        homeDesk: withY(homeDesk),
        intent: "commute_to_desk",
      },
      target: withY(homeDesk),
    };
  }

  let intent = agent.behavior.intent;
  let waitSeconds = Math.max(0, agent.behavior.waitSeconds - delta);
  const atTarget = distance2D(agent.position, agent.target) < 0.12;

  const playMode = useGameStore.getState().settings.play_mode;
  const office = normalizeOfficeVisual(
    useGameStore.getState().visualDesign.offices[agent.behavior.buildingId],
    agent.behavior.buildingId,
  );
  const moraleBoost =
    playMode === "game" && hasMoraleDecorNearby(agent.position, office);

  if (atTarget) {
    if (intent === "commute_to_desk") {
      intent = "working";
      waitSeconds = 8 + (hashString(agent.id) % 5);
    } else if (intent === "walking_to_meeting") {
      intent = "in_meeting";
      waitSeconds = 12;
    } else if (intent === "walking_to_break") {
      intent = "on_break";
      waitSeconds = moraleBoost ? 7 : 10;
    } else if (intent === "walking_to_plaza") {
      intent = "visiting_plaza";
      waitSeconds = 9;
    } else if (waitSeconds <= 0) {
      intent = chooseNextIntent(agent, record, tick);
      if (intent === "working" || intent === "commute_to_desk") {
        intent = "commute_to_desk";
      }
      waitSeconds = 6 + (hashString(agent.id) % 4);
    }
  } else if (intent === "working" || intent === "in_meeting" || intent === "on_break" || intent === "visiting_plaza") {
    intent =
      intent === "working"
        ? "commute_to_desk"
        : intent === "in_meeting"
          ? "walking_to_meeting"
          : intent === "on_break"
            ? "walking_to_break"
            : "walking_to_plaza";
  }

  const target = targetForIntent({ ...agent, behavior: { ...agent.behavior, intent } }, intent);
  const moving = distance2D(agent.position, target) >= 0.12;
  const speedMultiplier = record?.status === "throttled" ? 0.45 : 1;

  let position = agent.position;
  let path = agent.path;
  let pathIndex = agent.pathIndex ?? 0;
  let pathTargetKey = agent.pathTargetKey;

  if (moving) {
    const navGrid = getCampusNavGrid(buildings);
    const pathState = ensurePath(
      navGrid,
      agent.position,
      target,
      path,
      pathTargetKey,
      pathIndex,
    );
    path = pathState.path;
    pathIndex = pathState.pathIndex;
    pathTargetKey = pathState.pathTargetKey;

    const followed = followPath(
      agent.position,
      path,
      pathIndex,
      agent.speed * speedMultiplier,
      delta,
    );
    position = followed.position;
    pathIndex = followed.pathIndex;

    if (distance2D(position, target) >= 0.12 && pathIndex >= path.length) {
      position = moveTowards(position, target, agent.speed * speedMultiplier, delta);
    }
  } else {
    position = [target[0], 0, target[2]];
    path = undefined;
    pathIndex = 0;
    pathTargetKey = undefined;
  }

  const isWalking =
    moving &&
    (intent === "commute_to_desk" ||
      intent.startsWith("walking_"));

  const status: AgentStatus = isWalking
    ? "walking"
    : intent === "in_meeting"
      ? "meeting"
      : intent === "working"
        ? "working"
        : "idle";

  let statusLabel =
    record?.status === "throttled"
      ? `${agent.role} · throttled (low compute)`
      : statusLabelFor(intent, agent.role);
  if (moraleBoost && (intent === "working" || intent === "on_break")) {
    statusLabel = `${statusLabel} · cozy zone`;
  }

  return {
    ...agent,
    position,
    target,
    path,
    pathIndex,
    pathTargetKey,
    status,
    statusLabel,
    walkPhase: isWalking ? agent.walkPhase + delta * 9 : 0,
    behavior: {
      ...agent.behavior,
      intent,
      waitSeconds,
    },
  };
}

export function syncAgentsFromRecords(
  records: AgentRecord[],
  existing: Agent[],
): Agent[] {
  const existingMap = new Map(existing.map((agent) => [agent.id, agent]));

  return records.filter(isVisibleOfficeAgent).map((record) => {
    const current = existingMap.get(record.id);
    if (current) {
      return {
        ...current,
        name: record.name,
        role: record.role,
        department: record.department,
        status: mapBackendStatus(record.status),
      };
    }
    return createAgentFromRecord(record);
  });
}