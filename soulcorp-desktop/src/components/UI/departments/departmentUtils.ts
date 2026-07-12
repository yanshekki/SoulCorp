import type { CSSProperties } from "react";
import type { DepartmentListEntry, OrgChartNode } from "../../../types/game";

export type DepartmentsTabId = "teams" | "people";

/** UI copy for Departments page (structure vs people). */
export const DEPT_COPY = {
  pageTitle: "Departments",
  pageSubtitle: "Structure your company · who owns what · who reports to whom",
  teams: "Teams",
  people: "People & reporting",
  teamsHint: "Formal departments, SOPs, colors",
  peopleHint: "Managers, reports, team leads",
  generateStructure: "Generate structure",
  generateStructureBusy: "Generating…",
  addTeam: "Add team",
  autoAssignPeople: "Auto-assign people",
  autoAssignBusy: "Assigning…",
  emptyTeamsTitle: "No teams yet",
  emptyTeamsBody:
    "Build departments from your current projects, then place people on the People tab.",
  emptyTeamsPrimary: "Generate structure",
  emptyTeamsSecondary: "Add team manually",
  pickTeamTitle: "Select a team",
  pickTeamBody: "Choose a team to edit mission, colors, and routing name.",
  selectPersonTitle: "Select a person",
  selectPersonBody:
    "Click anyone in the tree to set department, manager, and team leadership.",
} as const;

export function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function countTreeNodes(nodes: OrgChartNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countTreeNodes(node.children), 0);
}

export function flattenOrgNodes(nodes: OrgChartNode[]): OrgChartNode[] {
  const flat: OrgChartNode[] = [];
  const walk = (list: OrgChartNode[]) => {
    for (const node of list) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return flat;
}

export function departmentAccentStyle(
  department: Pick<DepartmentListEntry, "brand_color" | "accent_color">,
): CSSProperties {
  return {
    ["--dept-brand" as string]: department.brand_color,
    ["--dept-accent" as string]: department.accent_color,
  };
}

export interface DepartmentFormState {
  name: string;
  display_name: string;
  sop: string;
  brand_color: string;
  accent_color: string;
}

export const EMPTY_DEPARTMENT_FORM: DepartmentFormState = {
  name: "",
  display_name: "",
  sop: "",
  brand_color: "#6d7f9b",
  accent_color: "#5ec8ff",
};

/** HTML `input[type=color]` requires exactly `#rrggbb`. */
export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const fb =
    fallback.startsWith("#") && /^#[0-9a-fA-F]{6}$/.test(fallback) ? fallback : "#6d7f9b";
  if (!value) {
    return fb;
  }
  const raw = value.trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  const digits = hex.replace(/[^0-9a-fA-F]/g, "");
  if (digits.length === 6) {
    return `#${digits.toLowerCase()}`;
  }
  if (digits.length === 3) {
    return `#${digits
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toLowerCase()}`;
  }
  if (digits.length === 8) {
    return `#${digits.slice(0, 6).toLowerCase()}`;
  }
  return fb;
}

export function departmentFormFromEntry(department: {
  name: string;
  display_name: string;
  sop: string;
  brand_color: string;
  accent_color: string;
}): DepartmentFormState {
  return {
    name: department.name,
    display_name: department.display_name,
    sop: department.sop,
    brand_color: normalizeHexColor(department.brand_color, "#6d7f9b"),
    accent_color: normalizeHexColor(department.accent_color, "#5ec8ff"),
  };
}