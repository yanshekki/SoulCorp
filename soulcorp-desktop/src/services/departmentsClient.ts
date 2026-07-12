import { invoke } from "../utils/tauriInvoke";
import type {
  AgentRecord,
  DepartmentsSnapshot,
  OrgChartSnapshot,
} from "../types/game";

export async function listDepartments() {
  return invoke<DepartmentsSnapshot>("list_departments");
}

export interface GenerateDepartmentsResult {
  snapshot: DepartmentsSnapshot;
  created: string[];
  skipped_existing: string[];
  source: string;
  message: string;
}

/** LLM (or heuristic) org generation from current projects. Always merges by name. */
export async function generateDepartmentsFromProjects(options?: { merge?: boolean }) {
  return invoke<GenerateDepartmentsResult>("generate_departments_from_projects", {
    request: { merge: options?.merge ?? true },
  });
}

export interface AssignOrgResult {
  updated: number;
  heads: string[];
  source: string;
  message: string;
  snapshot: OrgChartSnapshot;
}

/** LLM (or heuristic) assign every agent’s department, reports_to, manages_department. */
export async function assignOrgWithAi() {
  return invoke<AssignOrgResult>("assign_org_with_ai");
}

export async function getOrgChart() {
  return invoke<OrgChartSnapshot>("get_org_chart");
}

export async function createDepartment(payload: {
  name: string;
  display_name: string;
  sop: string;
  brand_color: string;
  accent_color: string;
  parent_department_id?: string | null;
}) {
  return invoke<DepartmentsSnapshot>("create_department", { request: payload });
}

export async function updateDepartment(payload: {
  department_id: string;
  display_name?: string;
  sop?: string;
  brand_color?: string;
  accent_color?: string;
  parent_department_id?: string | null;
  head_agent_id?: string | null;
}) {
  return invoke<DepartmentsSnapshot>("update_department", { request: payload });
}

export async function renameDepartment(departmentId: string, newName: string) {
  return invoke<DepartmentsSnapshot>("rename_department", {
    request: { department_id: departmentId, new_name: newName },
  });
}

export async function deleteDepartment(departmentId: string, transferTo: string) {
  return invoke<DepartmentsSnapshot>("delete_department", {
    request: { department_id: departmentId, transfer_to: transferTo },
  });
}

export async function updateAgentOrg(payload: {
  agent_id: string;
  department?: string;
  reports_to?: string | null;
  manages_department?: string | null;
}) {
  return invoke<AgentRecord>("update_agent_org", { request: payload });
}