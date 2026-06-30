export type AgentStatus = "idle" | "walking" | "working" | "meeting";

export type BehaviorIntent =
  | "commute_to_desk"
  | "working"
  | "walking_to_meeting"
  | "in_meeting"
  | "walking_to_break"
  | "on_break"
  | "walking_to_plaza"
  | "visiting_plaza";

export type HairStyle = "short" | "bob" | "spiky" | "long";

export interface AgentAppearance {
  seed: string;
  skinColor: string;
  shirtColor: string;
  pantsColor: string;
  hairColor: string;
  shoeColor: string;
  hairStyle: HairStyle;
  height: number;
  build: number;
}

export interface AgentBehavior {
  intent: BehaviorIntent;
  waitSeconds: number;
  homeDesk: [number, number, number];
  buildingId: string;
}

export interface Agent {
  id: string;
  name: string;
  department: string;
  role: string;
  color: string;
  status: AgentStatus;
  statusLabel: string;
  position: [number, number, number];
  target: [number, number, number];
  speed: number;
  appearance: AgentAppearance;
  behavior: AgentBehavior;
  walkPhase: number;
}

export interface Building {
  id: string;
  name: string;
  department: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  roofColor: string;
  accentColor: string;
  description: string;
}

export interface SimulationState {
  tick: number;
  agentsActive: number;
  dayNumber: number;
}

export interface WorldProp {
  id: string;
  type: "tree" | "bench" | "lamp" | "planter";
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}