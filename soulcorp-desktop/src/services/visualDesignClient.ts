import { invoke } from "../utils/tauriInvoke";
import type {
  AgentVisualConfig,
  BuildingVisualConfig,
  CampusThemeConfig,
  CompanyVisualDesign,
} from "../types/visualDesign";

export async function getVisualDesign(): Promise<CompanyVisualDesign> {
  const response = await invoke<{ design: CompanyVisualDesign }>("get_visual_design");
  return response.design;
}

export async function saveVisualDesign(
  design: CompanyVisualDesign,
): Promise<CompanyVisualDesign> {
  const response = await invoke<{ design: CompanyVisualDesign }>("save_visual_design", {
    design,
  });
  return response.design;
}

export async function updateBuildingVisual(
  buildingId: string,
  config: BuildingVisualConfig,
): Promise<CompanyVisualDesign> {
  const response = await invoke<{ design: CompanyVisualDesign }>("update_building_visual", {
    request: { building_id: buildingId, config },
  });
  return response.design;
}

export async function updateOfficeVisual(
  buildingId: string,
  config: import("../types/visualDesign").OfficeVisualConfig,
): Promise<CompanyVisualDesign> {
  const response = await invoke<{ design: CompanyVisualDesign }>("update_office_visual", {
    request: { building_id: buildingId, config },
  });
  return response.design;
}

export async function updateAgentVisual(
  agentId: string,
  config: AgentVisualConfig,
): Promise<CompanyVisualDesign> {
  const response = await invoke<{ design: CompanyVisualDesign }>("update_agent_visual", {
    request: { agent_id: agentId, config },
  });
  return response.design;
}

export async function updateCampusTheme(
  campus: CampusThemeConfig,
): Promise<CompanyVisualDesign> {
  const response = await invoke<{ design: CompanyVisualDesign }>("update_campus_theme", {
    campus,
  });
  return response.design;
}

export async function applyDesignPreset(presetId: string): Promise<CompanyVisualDesign> {
  const response = await invoke<{ design: CompanyVisualDesign }>("apply_design_preset", {
    request: { preset_id: presetId },
  });
  return response.design;
}