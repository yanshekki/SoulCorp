import type { SidebarPanel } from "../types/game";
import {
  showAchievements,
  showDesignStudio,
  showGodMode,
  showOffice3D,
} from "./features";

export interface NavPanel {
  id: SidebarPanel;
  label: string;
  /** Step number within the CEO workflow (1–7). */
  workflowStep?: number;
  /** Short action hint shown in nav tooltips / ribbon. */
  workflowHint?: string;
}

export interface NavGroup {
  label: string;
  panels: NavPanel[];
  /** Primary run-company flow — rendered with step connectors in the ribbon. */
  isWorkflow?: boolean;
}

export interface WorkflowStep {
  step: number;
  panel: SidebarPanel;
  label: string;
  hint: string;
}

/** Core CEO loop: plan → align → deliver. */
export const WORKFLOW_CHAIN: SidebarPanel[] = ["projects", "meeting", "workspace"];

const V1_NAV_GROUPS: NavGroup[] = [
  {
    label: "Workflow",
    isWorkflow: true,
    panels: [
      { id: "projects", label: "Projects", workflowStep: 1, workflowHint: "Plan & execute" },
      { id: "meeting", label: "Meeting", workflowStep: 2, workflowHint: "Align team" },
      { id: "workspace", label: "Workspace", workflowStep: 3, workflowHint: "Review output" },
    ],
  },
  {
    label: "Team & Budget",
    panels: [
      { id: "recruitment", label: "Recruitment", workflowStep: 4, workflowHint: "Hire agents" },
      { id: "agents", label: "Agent Brains", workflowStep: 5, workflowHint: "Configure AI" },
      { id: "finance", label: "Tokens", workflowStep: 6, workflowHint: "Manage budget" },
    ],
  },
  {
    label: "Growth",
    panels: [
      { id: "marketplace", label: "Marketplace", workflowStep: 7, workflowHint: "Earn revenue" },
    ],
  },
  {
    label: "Account",
    panels: [
      { id: "executive", label: "Executive" },
      { id: "tier", label: "Pro / VIP" },
    ],
  },
  {
    label: "System",
    panels: [{ id: "settings", label: "Settings" }],
  },
];

const V2_NAV_GROUPS: NavGroup[] = [
  {
    label: "Campus",
    panels: [{ id: "office", label: "Office" }],
  },
  {
    label: "Workflow",
    isWorkflow: true,
    panels: [
      { id: "projects", label: "Projects", workflowStep: 1, workflowHint: "Plan & execute" },
      { id: "meeting", label: "Meeting", workflowStep: 2, workflowHint: "Align team" },
      { id: "workspace", label: "Workspace", workflowStep: 3, workflowHint: "Review output" },
    ],
  },
  {
    label: "Team & Budget",
    panels: [
      { id: "recruitment", label: "Recruitment", workflowStep: 4, workflowHint: "Hire agents" },
      { id: "agents", label: "Agent Brains", workflowStep: 5, workflowHint: "Configure AI" },
      { id: "finance", label: "Tokens", workflowStep: 6, workflowHint: "Manage budget" },
    ],
  },
  {
    label: "Growth",
    panels: [
      { id: "marketplace", label: "Marketplace", workflowStep: 7, workflowHint: "Earn revenue" },
    ],
  },
  {
    label: "Creative",
    panels: [{ id: "design_studio", label: "3D Design" }],
  },
  {
    label: "Account",
    panels: [
      { id: "tier", label: "Pro / VIP" },
      { id: "executive", label: "Executive" },
      { id: "achievements", label: "Achievements" },
    ],
  },
  {
    label: "System",
    panels: [
      { id: "settings", label: "Settings" },
      { id: "god_mode", label: "God Mode" },
    ],
  },
];

export function getNavGroups(): NavGroup[] {
  return showOffice3D ? V2_NAV_GROUPS : V1_NAV_GROUPS;
}

export function getWorkflowSteps(): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  for (const group of getNavGroups()) {
    for (const panel of group.panels) {
      if (panel.workflowStep != null) {
        steps.push({
          step: panel.workflowStep,
          panel: panel.id,
          label: panel.label,
          hint: panel.workflowHint ?? "",
        });
      }
    }
  }
  return steps.sort((a, b) => a.step - b.step);
}

export function getPrimaryWorkflowSteps(): WorkflowStep[] {
  return getWorkflowSteps().filter((s) => WORKFLOW_CHAIN.includes(s.panel));
}

export function getNextWorkflowPanel(panel: SidebarPanel): SidebarPanel | null {
  const chain = WORKFLOW_CHAIN;
  const index = chain.indexOf(panel);
  if (index < 0 || index >= chain.length - 1) return null;
  return chain[index + 1];
}

export function isPanelVisibleInEdition(panel: SidebarPanel): boolean {
  switch (panel) {
    case "office":
      return showOffice3D;
    case "design_studio":
      return showDesignStudio;
    case "god_mode":
      return showGodMode;
    case "achievements":
      return showAchievements;
    default:
      return true;
  }
}

export function normalizePanelForEdition(panel: SidebarPanel): SidebarPanel {
  return isPanelVisibleInEdition(panel) ? panel : "projects";
}

export const IMMERSIVE_PANELS = new Set<SidebarPanel>([
  "workspace",
  "design_studio",
  "settings",
  "god_mode",
  "achievements",
  "executive",
  "agents",
  "recruitment",
  "marketplace",
  "finance",
  "meeting",
  "projects",
]);