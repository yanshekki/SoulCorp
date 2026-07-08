import type { SidebarPanel } from "../types/game";
import {
  showAchievements,
  showDesignStudio,
  showGodMode,
  showOffice3D,
  showTierPanel,
} from "./features";

export interface NavPanel {
  id: SidebarPanel;
  label: string;
  /** Step number within the CEO workflow — derived from CEO_WORKFLOW_CHAIN. */
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

/**
 * Full CEO run-company order. Step numbers (1–9) are derived from position here.
 * Plan → align → deliver → org → hire → configure → monitor → budget → grow.
 */
export const CEO_WORKFLOW_CHAIN: SidebarPanel[] = [
  "projects",
  "meeting",
  "workspace",
  "departments",
  "recruitment",
  "agents",
  "observatory",
  "finance",
  "marketplace",
];

/** Core deliver loop — plan → align → review. */
export const WORKFLOW_CHAIN: SidebarPanel[] = ["projects", "meeting", "workspace"];

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    label: "Workflow",
    isWorkflow: true,
    panels: [
      { id: "projects", label: "Projects", workflowHint: "Plan & execute" },
      { id: "meeting", label: "Meeting", workflowHint: "Align team" },
      { id: "workspace", label: "Workspace", workflowHint: "Review output" },
    ],
  },
  {
    label: "Team & Budget",
    panels: [
      { id: "departments", label: "Departments", workflowHint: "Org structure" },
      { id: "recruitment", label: "Recruitment", workflowHint: "Hire agents" },
      { id: "agents", label: "Agent Brains", workflowHint: "Configure AI" },
      { id: "observatory", label: "Observatory", workflowHint: "Live agent minds" },
      { id: "finance", label: "Tokens", workflowHint: "Manage budget" },
    ],
  },
  {
    label: "Growth",
    panels: [{ id: "marketplace", label: "Marketplace", workflowHint: "Earn revenue" }],
  },
  {
    label: "System",
    panels: [{ id: "settings", label: "Settings" }],
  },
];

const V2_NAV_TAIL: NavGroup[] = [
  {
    label: "Creative",
    panels: [{ id: "design_studio", label: "3D Design" }],
  },
  {
    label: "Account",
    panels: [
      { id: "tier", label: "Pro / VIP" },
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

function getBaseNavGroups(): NavGroup[] {
  if (!showOffice3D) {
    return BASE_NAV_GROUPS;
  }

  const [workflow, teamBudget, growth] = BASE_NAV_GROUPS;
  return [
    { label: "Campus", panels: [{ id: "office", label: "Office" }] },
    workflow,
    teamBudget,
    growth,
    ...V2_NAV_TAIL,
  ];
}

function findNavPanel(panel: SidebarPanel): NavPanel | null {
  for (const group of getBaseNavGroups()) {
    const match = group.panels.find((entry) => entry.id === panel);
    if (match) {
      return match;
    }
  }
  return null;
}

export function getPanelWorkflowStep(panel: SidebarPanel): number | null {
  const index = CEO_WORKFLOW_CHAIN.indexOf(panel);
  return index >= 0 ? index + 1 : null;
}

export function formatWorkflowStepBadge(panel: SidebarPanel, suffix?: string): string | undefined {
  const step = getPanelWorkflowStep(panel);
  if (step == null) {
    return suffix;
  }
  const base = `Step ${step}`;
  return suffix ? `${base} · ${suffix}` : base;
}

export function getWorkflowPanelLabel(panel: SidebarPanel): string {
  return findNavPanel(panel)?.label ?? panel;
}

export function getWorkflowPanelHint(panel: SidebarPanel): string {
  return findNavPanel(panel)?.workflowHint ?? "";
}

function withWorkflowStep(panel: NavPanel): NavPanel {
  const step = getPanelWorkflowStep(panel.id);
  return step != null ? { ...panel, workflowStep: step } : panel;
}

export function getNavGroups(): NavGroup[] {
  return getBaseNavGroups().map((group) => ({
    ...group,
    panels: group.panels.map(withWorkflowStep),
  }));
}

export function getWorkflowSteps(): WorkflowStep[] {
  return CEO_WORKFLOW_CHAIN.map((panel, index) => ({
    step: index + 1,
    panel,
    label: getWorkflowPanelLabel(panel),
    hint: getWorkflowPanelHint(panel),
  }));
}

export function getPrimaryWorkflowSteps(): WorkflowStep[] {
  return getWorkflowSteps().filter((step) => WORKFLOW_CHAIN.includes(step.panel));
}

export function getNextWorkflowPanel(panel: SidebarPanel): SidebarPanel | null {
  const index = CEO_WORKFLOW_CHAIN.indexOf(panel);
  if (index < 0 || index >= CEO_WORKFLOW_CHAIN.length - 1) {
    return null;
  }
  return CEO_WORKFLOW_CHAIN[index + 1];
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
    case "tier":
      return showTierPanel;
    case "executive":
      return false;
    default:
      return true;
  }
}

export function normalizePanelForEdition(panel: SidebarPanel): SidebarPanel {
  if (panel === "executive") {
    return "projects";
  }
  return isPanelVisibleInEdition(panel) ? panel : "projects";
}

export const IMMERSIVE_PANELS = new Set<SidebarPanel>([
  "workspace",
  "design_studio",
  "settings",
  "god_mode",
  "achievements",
  "departments",
  "agents",
  "observatory",
  "recruitment",
  "marketplace",
  "finance",
  "meeting",
  "projects",
]);