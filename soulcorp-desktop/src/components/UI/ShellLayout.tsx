import type { ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";
import { AchievementsPanel } from "./AchievementsPanel";
import { OfflineStatusBar } from "./OfflineStatusBar";
import { Dashboard } from "./Dashboard";
import { FinancePanel } from "./FinancePanel";
import { GodModePanel } from "./GodModePanel";
import { MarketplacePanel } from "./MarketplacePanel";
import { MeetingPanel } from "./MeetingPanel";
import { PauseMenu } from "./PauseMenu";
import { RecruitmentPanel } from "./RecruitmentPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TierPanel } from "./TierPanel";
import { VipExecutivePanel } from "./VipExecutivePanel";

interface ShellLayoutProps {
  children: ReactNode;
  statusMessage: string;
}

const PANELS: { id: SidebarPanel; label: string }[] = [
  { id: "office", label: "Office" },
  { id: "workspace", label: "Workspace" },
  { id: "meeting", label: "Meeting" },
  { id: "finance", label: "Finance" },
  { id: "marketplace", label: "Marketplace" },
  { id: "recruitment", label: "Recruitment" },
  { id: "tier", label: "Pro / VIP" },
  { id: "executive", label: "Executive" },
  { id: "achievements", label: "Achievements" },
  { id: "settings", label: "Settings" },
  { id: "god_mode", label: "God Mode" },
];

function TierBadge() {
  const tier = useGameStore((state) => state.tierBenefits.tier);
  return <span className={`sidebar-tier tier-${tier}`}>{tier.toUpperCase()}</span>;
}

function SidebarTitle() {
  const companyName = useGameStore((state) => state.companyName);
  return <h1>{companyName}</h1>;
}

function SidebarPanelContent({ panel }: { panel: SidebarPanel }) {
  switch (panel) {
    case "workspace":
      return (
        <section className="panel-card">
          <h2>Workspace</h2>
          <p className="muted">Use the main panel to browse folders, edit pages, and search docs.</p>
        </section>
      );
    case "meeting":
      return <MeetingPanel />;
    case "finance":
      return <FinancePanel />;
    case "marketplace":
      return <MarketplacePanel />;
    case "recruitment":
      return <RecruitmentPanel />;
    case "tier":
      return <TierPanel />;
    case "executive":
      return <VipExecutivePanel />;
    case "achievements":
      return <AchievementsPanel />;
    case "settings":
      return <SettingsPanel />;
    case "god_mode":
      return <GodModePanel />;
    case "office":
    default:
      return <Dashboard />;
  }
}

export function ShellLayout({ children, statusMessage }: ShellLayoutProps) {
  const togglePause = useGameStore((state) => state.togglePause);
  const isPaused = useGameStore((state) => state.isPaused);
  const activePanel = useGameStore((state) => state.activePanel);
  const setActivePanel = useGameStore((state) => state.setActivePanel);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <SidebarTitle />
          <p className="tagline">AI Company Simulator</p>
          <TierBadge />
        </div>
        <div className="sidebar-content">
          <SidebarPanelContent panel={activePanel} />
        </div>
        <nav className="sidebar-actions">
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              type="button"
              className={activePanel === panel.id ? "active" : undefined}
              onClick={() => setActivePanel(panel.id)}
            >
              {panel.label}
            </button>
          ))}
          <button type="button" onClick={togglePause}>
            {isPaused ? "Resume" : "Pause"}
          </button>
        </nav>
      </aside>
      <main className="main-panel">
        <div className="main-panel-viewport">{children}</div>
        <footer className="status-bar">
          <OfflineStatusBar />
          <span className="status-message">{statusMessage}</span>
        </footer>
      </main>
      <PauseMenu />
    </div>
  );
}