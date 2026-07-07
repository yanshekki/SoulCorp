import type { CSSProperties } from "react";
import type { DepartmentListEntry, OrgChartNode } from "../../../types/game";

export type DepartmentsTabId = "org" | "departments";

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