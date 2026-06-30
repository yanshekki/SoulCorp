export type AgentStatus = "idle" | "walking" | "working" | "meeting";

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
}

export interface Building {
  id: string;
  name: string;
  department: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  roofColor: string;
  description: string;
}

export interface SimulationState {
  tick: number;
  agentsActive: number;
  dayNumber: number;
}