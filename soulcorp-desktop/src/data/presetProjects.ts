export type ProjectSetupMode = "custom";

export interface ProjectSetupState {
  mode: ProjectSetupMode;
  customTitle: string;
  customDescription: string;
  customDepartment: string;
}

export function defaultProjectSetupState(companyName = ""): ProjectSetupState {
  const base = companyName.trim();
  return {
    mode: "custom",
    customTitle: base.length >= 2 ? `${base} — Flagship` : "",
    customDescription: "",
    customDepartment: "",
  };
}

export function isProjectSetupValid(setup: ProjectSetupState): boolean {
  return setup.customTitle.trim().length >= 2;
}

export function toProjectSetupPayload(setup: ProjectSetupState) {
  return {
    project_setup_mode: setup.mode,
    custom_project: {
      title: setup.customTitle.trim(),
      description: setup.customDescription.trim(),
      owner_department: setup.customDepartment.trim(),
    },
  };
}