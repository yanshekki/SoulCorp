import type { AgentSlotMode, AgentSlotSetup } from "../types/game";

export interface PresetAgentDefinition {
  preset_id: string;
  name: string;
  role: string;
  department: string;
  summary: string;
  defaultSoulMd: string;
}

export const PRESET_AGENTS: PresetAgentDefinition[] = [
  {
    preset_id: "mira",
    name: "Mira",
    role: "Senior Dev",
    department: "Engineering",
    summary: "Ships quality code and protects team focus.",
    defaultSoulMd: `# Mira

## Personality
Focused, analytical, dry humor, prefers clean abstractions.

## Values
Ship quality code, protect team focus, document decisions.

## Communication Style
Direct and concise with occasional sarcasm.
`,
  },
  {
    preset_id: "kai",
    name: "Kai",
    role: "HR Lead",
    department: "Human Resources",
    summary: "Builds healthy teams with honest feedback.",
    defaultSoulMd: `# Kai

## Personality
Warm, observant, emotionally intelligent facilitator.

## Values
Healthy teams, honest feedback, sustainable pace.

## Communication Style
Supportive and structured, asks clarifying questions.
`,
  },
  {
    preset_id: "ren",
    name: "Ren",
    role: "COO",
    department: "Executive",
    summary: "Keeps priorities clear and execution accountable.",
    defaultSoulMd: `# Ren

## Personality
Strategic, calm under pressure, systems thinker.

## Values
Long-term company health, clear priorities, accountable execution.

## Communication Style
Executive summaries first, then supporting detail.
`,
  },
];

export interface AgentRosterSlotState {
  preset_id: string;
  mode: AgentSlotMode;
  soul_md_content: string;
  candidate_id: string | null;
  role: string;
  department: string;
  offered_salary: number | null;
  system_prompt_source: string | null;
  soul_md_edited: boolean;
}

export function defaultAgentRosterState(): AgentRosterSlotState[] {
  return PRESET_AGENTS.map((preset) => ({
    preset_id: preset.preset_id,
    mode: "preset",
    soul_md_content: preset.defaultSoulMd,
    candidate_id: null,
    role: preset.role,
    department: preset.department,
    offered_salary: null,
    system_prompt_source: null,
    soul_md_edited: false,
  }));
}

export function presetForId(presetId: string): PresetAgentDefinition | undefined {
  return PRESET_AGENTS.find((preset) => preset.preset_id === presetId);
}

export function toAgentRosterPayload(slots: AgentRosterSlotState[]): AgentSlotSetup[] {
  return slots.map((slot) => ({
    preset_id: slot.preset_id,
    mode: slot.mode,
    soul_md_content:
      slot.mode === "preset" || slot.soul_md_content.trim().length > 0
        ? slot.soul_md_content
        : null,
    candidate_id: slot.mode === "recruit" ? slot.candidate_id : null,
    role: slot.mode === "recruit" ? slot.role : null,
    department: slot.mode === "recruit" ? slot.department : null,
    offered_salary: slot.mode === "recruit" ? slot.offered_salary : null,
    system_prompt_source:
      slot.mode === "recruit" &&
      !slot.soul_md_edited &&
      slot.system_prompt_source?.trim()
        ? slot.system_prompt_source
        : null,
    soul_md_edited: slot.mode === "recruit" ? slot.soul_md_edited : false,
  }));
}