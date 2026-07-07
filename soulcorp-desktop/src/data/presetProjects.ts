export interface PresetProjectDefinition {
  id: string;
  title: string;
  department: string;
  description: string;
}

export const PRESET_PROJECTS: PresetProjectDefinition[] = [
  {
    id: "proj-core",
    title: "SoulCorp Core Platform",
    department: "Engineering",
    description: "Core AI company platform features with a starter backlog story.",
  },
  {
    id: "proj-hr",
    title: "Team Culture Program",
    department: "Human Resources",
    description: "Morale, rituals, and team health initiatives.",
  },
];

export type ProjectSetupMode = "preset" | "custom";

export interface ProjectSetupState {
  mode: ProjectSetupMode;
  customTitle: string;
  customDescription: string;
  customDepartment: string;
}

export function defaultProjectSetupState(companyName = ""): ProjectSetupState {
  const base = companyName.trim();
  return {
    mode: "preset",
    customTitle: base.length >= 2 ? `${base} — Flagship` : "",
    customDescription: "",
    customDepartment: "Engineering",
  };
}

export function isProjectSetupValid(setup: ProjectSetupState): boolean {
  if (setup.mode === "preset") {
    return true;
  }
  return setup.customTitle.trim().length >= 2;
}

export function toProjectSetupPayload(setup: ProjectSetupState) {
  return {
    project_setup_mode: setup.mode,
    custom_project:
      setup.mode === "custom"
        ? {
            title: setup.customTitle.trim(),
            description: setup.customDescription.trim(),
            owner_department: setup.customDepartment.trim() || "Engineering",
          }
        : null,
  };
}