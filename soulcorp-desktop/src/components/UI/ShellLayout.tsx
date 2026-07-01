import type { ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";
import { AudioMuteButton } from "./AudioMuteButton";
import { CompanySwitcher } from "./CompanySwitcher";
import { AchievementsPanel } from "./AchievementsPanel";
import { OfflineStatusBar } from "./OfflineStatusBar";
import { Dashboard } from "./Dashboard";
import { FinancePanel } from "./FinancePanel";
import { GodModePanel } from "./GodModePanel";
import { MarketplacePanel } from "./MarketplacePanel";
import { MeetingPanel } from "./MeetingPanel";
import { PauseMenu } from "./PauseMenu";
import { RecruitmentPanel } from "./RecruitmentPanel";
import { AgentsPanel } from "./AgentsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TierPanel } from "./TierPanel";
import { TestModeButton } from "./TestModeButton";
import { VipExecutivePanel } from "./VipExecutivePanel";

interface ShellLayoutProps {
  children: ReactNode;
  statusMessage: string;
}

interface NavGroup {
  label: string;
  panels: { id: SidebarPanel; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Core",
    panels: [
      { id: "office", label: "Office" },
      { id: "workspace", label: "Workspace" },
      { id: "meeting", label: "Meeting" },
      { id: "design_studio", label: "3D Design" },
    ],
  },
  {
    label: "Business",
    panels: [
      { id: "finance", label: "Tokens" },
      { id: "marketplace", label: "Marketplace" },
      { id: "recruitment", label: "Recruitment" },
      { id: "agents", label: "Agent Brains" },
    ],
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

function TierBadge() {
  const tier = useGameStore((state) => state.tierBenefits.tier);
  return <span className={`sidebar-tier tier-${tier}`}>{tier.toUpperCase()}</span>;
}

function SidebarTitle() {
  const companyName = useGameStore((state) => state.companyName);
  const companyTagline = useGameStore((state) => state.companyTagline);
  return (
    <div className="app-brand-text">
      <h1>{companyName || "SoulCorp"}</h1>
      {companyTagline ? <p className="app-company-tagline">{companyTagline}</p> : null}
    </div>
  );
}

function SidebarPanelContent({ panel }: { panel: SidebarPanel }) {
  switch (panel) {
    case "workspace":
      return (
        <section className="panel-card workspace-guide">
          <h2>Workspace Guide</h2>
          <p className="muted">
            Company Hub holds strategy and activity feed. Teams are organized by department with
            shared pages and employee journals underneath.
          </p>
          <ul className="workspace-guide-list">
            <li>
              <strong>CEO (you)</strong> — edit team pages, link projects/agents, create or delete
              docs.
            </li>
            <li>
              <strong>Employees</strong> — simulation auto-updates daily journals and meeting notes
              in their folder.
            </li>
            <li>
              <strong>Teams</strong> — use Team Overview + Weekly Priorities, or add custom
              subfolders per squad.
            </li>
          </ul>
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
    case "agents":
      return <AgentsPanel />;
    case "tier":
      return <TierPanel />;
    case "executive":
      return <VipExecutivePanel />;
    case "achievements":
      return <AchievementsPanel />;
    case "design_studio":
      return (
        <section className="panel-card">
          <h2>3D Design Studio</h2>
          <p className="muted">
            Customize campus theme, department buildings, office interiors, and agent looks in the
            main stage.
          </p>
          <p className="muted">Use the top nav <strong>3D Design</strong> tab to open the editor.</p>
        </section>
      );
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
  const worldView = useGameStore((state) => state.worldView);
  const inspectorExpanded = useGameStore((state) => state.inspectorExpanded);
  const setInspectorExpanded = useGameStore((state) => state.setInspectorExpanded);

  const immersiveInterior = worldView === "interior" && activePanel === "office";
  const immersiveDesignStudio = activePanel === "design_studio";
  const immersiveStage = immersiveInterior || immersiveDesignStudio;
  const inspectorDrawerOpen = immersiveInterior && inspectorExpanded;
  const hideShellInspector = immersiveDesignStudio || (immersiveInterior && !inspectorExpanded);

  return (
    <div
      className={`app-shell${immersiveInterior || immersiveDesignStudio ? " app-shell--immersive-office" : ""}${immersiveInterior ? " app-shell--tph-interior" : ""}`}
    >
      <header className="app-topbar">
        <div className="app-topbar-row app-topbar-row-primary">
          <div className="app-brand">
            <SidebarTitle />
            <p className="app-tagline">AI Company Simulator</p>
            <TierBadge />
          </div>
          <div className="app-topbar-actions">
            <AudioMuteButton className="audio-mute-btn app-topbar-mute" />
            <CompanySwitcher />
            <button type="button" className="app-pause-btn" onClick={togglePause}>
              {isPaused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
        <div className="app-topbar-row app-topbar-row-nav">
          <nav className="app-nav" aria-label="Main navigation">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="nav-group" role="group" aria-label={group.label}>
                <span className="nav-group-label">{group.label}</span>
                {group.panels.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    className={`nav-btn${activePanel === panel.id ? " active" : ""}`}
                    onClick={() => setActivePanel(panel.id)}
                  >
                    {panel.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </header>

      <div className={`app-body${immersiveStage ? " app-body--immersive" : ""}`}>
        {inspectorDrawerOpen ? (
          <button
            type="button"
            className="app-inspector-backdrop"
            onClick={() => setInspectorExpanded(false)}
            aria-label="Close inspector"
          />
        ) : null}
        {!hideShellInspector ? (
          <aside
            className={`app-inspector${inspectorDrawerOpen ? " app-inspector--immersive-drawer" : ""}`}
            aria-label="Inspector panel"
          >
            {inspectorDrawerOpen ? (
              <button
                type="button"
                className="app-inspector-collapse-btn"
                onClick={() => setInspectorExpanded(false)}
                aria-label="Hide inspector"
                title="Hide inspector"
              >
                ‹
              </button>
            ) : null}
            <div className="app-inspector-scroll">
              <SidebarPanelContent panel={activePanel} />
            </div>
          </aside>
        ) : null}
        {immersiveInterior && !inspectorExpanded ? (
          <button
            type="button"
            className="app-inspector-expand-tab"
            onClick={() => setInspectorExpanded(true)}
            aria-label="Show inspector"
            title="Show inspector"
          >
            ›
          </button>
        ) : null}
        <main className={`app-stage${immersiveStage ? " app-stage--immersive" : ""}`}>
          <div className="main-panel-viewport">{children}</div>
        </main>
      </div>

      {!immersiveInterior ? (
        <footer className="app-statusbar">
          <OfflineStatusBar />
          <TestModeButton placement="statusbar" />
          <span className="status-message">{statusMessage}</span>
        </footer>
      ) : null}

      <PauseMenu />
    </div>
  );
}