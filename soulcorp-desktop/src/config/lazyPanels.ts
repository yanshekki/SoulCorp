import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { SidebarPanel } from "../types/game";
import {
  showAchievements,
  showDesignStudio,
  showGodMode,
  showOffice3D,
} from "./features";

export const LazyWorkspaceShell = lazy(() =>
  import("../components/workspace/WorkspaceShell").then((m) => ({ default: m.WorkspaceShell })),
);
export const LazyMeetingPage = lazy(() =>
  import("../components/UI/MeetingPage").then((m) => ({ default: m.MeetingPage })),
);
export const LazyProjectsPage = lazy(() =>
  import("../components/UI/ProjectsPage").then((m) => ({ default: m.ProjectsPage })),
);
export const LazyDesignStudioPage = lazy(() =>
  import("../components/design/DesignStudioPage").then((m) => ({ default: m.DesignStudioPage })),
);
export const LazySettingsPage = lazy(() =>
  import("../components/UI/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
export const LazyGodModePage = lazy(() =>
  import("../components/UI/GodModePage").then((m) => ({ default: m.GodModePage })),
);
export const LazyAchievementsPage = lazy(() =>
  import("../components/UI/AchievementsPage").then((m) => ({ default: m.AchievementsPage })),
);
export const LazyDepartmentsPage = lazy(() =>
  import("../components/UI/departments/DepartmentsPage").then((m) => ({ default: m.DepartmentsPage })),
);
export const LazyAgentsPage = lazy(() =>
  import("../components/UI/AgentsPage").then((m) => ({ default: m.AgentsPage })),
);
export const LazyObservatoryPage = lazy(() =>
  import("../components/UI/ObservatoryPage").then((m) => ({ default: m.ObservatoryPage })),
);
export const LazyRecruitmentPage = lazy(() =>
  import("../components/UI/RecruitmentPage").then((m) => ({ default: m.RecruitmentPage })),
);
export const LazyMarketplacePage = lazy(() =>
  import("../components/UI/MarketplacePage").then((m) => ({ default: m.MarketplacePage })),
);
export const LazyTokensPage = lazy(() =>
  import("../components/UI/TokensPage").then((m) => ({ default: m.TokensPage })),
);
export const LazyGameScene = lazy(() =>
  import("../components/GameScene").then((m) => ({ default: m.GameScene })),
);

export function resolveLazyPanel(
  panel: SidebarPanel,
): LazyExoticComponent<ComponentType<object>> | null {
  switch (panel) {
    case "workspace":
      return LazyWorkspaceShell;
    case "meeting":
      return LazyMeetingPage;
    case "projects":
      return LazyProjectsPage;
    case "design_studio":
      return showDesignStudio ? LazyDesignStudioPage : null;
    case "settings":
      return LazySettingsPage;
    case "god_mode":
      return showGodMode ? LazyGodModePage : null;
    case "achievements":
      return showAchievements ? LazyAchievementsPage : null;
    case "departments":
      return LazyDepartmentsPage;
    case "agents":
      return LazyAgentsPage;
    case "observatory":
      return LazyObservatoryPage;
    case "recruitment":
      return LazyRecruitmentPage;
    case "marketplace":
      return LazyMarketplacePage;
    case "finance":
      return LazyTokensPage;
    case "office":
      return showOffice3D ? LazyGameScene : null;
    default:
      return null;
  }
}

/** Prefetch panel JS chunk on hover / idle. */
export const PANEL_PREFETCH: Partial<Record<SidebarPanel, () => Promise<unknown>>> = {
  workspace: () => import("../components/workspace/WorkspaceShell"),
  meeting: () => import("../components/UI/MeetingPage"),
  projects: () => import("../components/UI/ProjectsPage"),
  design_studio: () => import("../components/design/DesignStudioPage"),
  settings: () => import("../components/UI/SettingsPage"),
  god_mode: () => import("../components/UI/GodModePage"),
  achievements: () => import("../components/UI/AchievementsPage"),
  departments: () => import("../components/UI/departments/DepartmentsPage"),
  agents: () => import("../components/UI/AgentsPage"),
  observatory: () => import("../components/UI/ObservatoryPage"),
  recruitment: () => import("../components/UI/RecruitmentPage"),
  marketplace: () => import("../components/UI/MarketplacePage"),
  finance: () => import("../components/UI/TokensPage"),
  office: () => import("../components/GameScene"),
};

export function prefetchPanel(panel: SidebarPanel): void {
  const loader = PANEL_PREFETCH[panel];
  if (loader) {
    void loader();
  }
}