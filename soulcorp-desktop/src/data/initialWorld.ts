import { BUILDING_ENTRANCES, deskForAgent } from "./worldLayout";
import type { Agent, Building } from "../types/world";
import { generateAgentAppearance } from "../utils/agentAppearance";

export const INITIAL_BUILDINGS: Building[] = [
  {
    id: "hq",
    name: "Company HQ",
    department: "Executive",
    position: [0, 0, 0],
    size: [4.2, 3.2, 4.2],
    color: "#8b6f5c",
    roofColor: "#5f8a72",
    accentColor: "#ffd166",
    description: "Main office hub with strategy rooms and CEO suite.",
  },
  {
    id: "engineering",
    name: "Engineering Lab",
    department: "Engineering",
    position: [-6, 0, 2],
    size: [3.8, 2.8, 3.4],
    color: "#6d7f9b",
    roofColor: "#4a6fa5",
    accentColor: "#5ec8ff",
    description: "Where agents ship code, prototypes, and experiments.",
  },
  {
    id: "hr",
    name: "HR Lounge",
    department: "Human Resources",
    position: [6, 0, -2],
    size: [3.2, 2.4, 3.8],
    color: "#9b7a8d",
    roofColor: "#c97b84",
    accentColor: "#ff9bd5",
    description: "Recruitment interviews and team morale events.",
  },
  {
    id: "plaza",
    name: "Hub Plaza",
    department: "Marketplace",
    position: [0, 0, -7],
    size: [5.4, 1.4, 3.4],
    color: "#a6896b",
    roofColor: "#d4b896",
    accentColor: "#f2c879",
    description: "Gig board and cross-company marketplace area.",
  },
  {
    id: "park",
    name: "Agent Park",
    department: "Recreation",
    position: [8.5, 0, 4.5],
    size: [3.6, 1.2, 3.6],
    color: "#6f9b7a",
    roofColor: "#8bc49a",
    accentColor: "#b8e6c8",
    description: "Break area for idle agents, relationships, and morale events.",
  },
];

function seedAgent(
  id: string,
  name: string,
  department: string,
  role: string,
  buildingId: string,
): Agent {
  const appearance = generateAgentAppearance(id);
  const desk = deskForAgent(buildingId, id);
  const entrance = BUILDING_ENTRANCES[buildingId] ?? desk;

  return {
    id,
    name,
    department,
    role,
    color: appearance.shirtColor,
    status: "walking",
    statusLabel: "Heading to desk",
    position: [entrance[0], 0, entrance[2]],
    target: [desk[0], 0, desk[2]],
    speed: 1.1,
    appearance,
    behavior: {
      intent: "commute_to_desk",
      waitSeconds: 0,
      homeDesk: [desk[0], 0, desk[2]],
      buildingId,
    },
    walkPhase: 0,
  };
}

export const INITIAL_AGENTS: Agent[] = [
  seedAgent("agent-1", "Mira", "Engineering", "Senior Dev", "engineering"),
  seedAgent("agent-2", "Kai", "Human Resources", "HR Lead", "hr"),
  seedAgent("agent-3", "Ren", "Executive", "COO", "hq"),
];