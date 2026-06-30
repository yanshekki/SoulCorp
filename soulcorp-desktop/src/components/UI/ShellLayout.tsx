import type { ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";
import { Dashboard } from "./Dashboard";
import { FinancePanel } from "./FinancePanel";
import { GodModePanel } from "./GodModePanel";
import { MeetingPanel } from "./MeetingPanel";
import { PauseMenu } from "./PauseMenu";
import { SettingsPanel } from "./SettingsPanel";

interface ShellLayoutProps {
  children: ReactNode;
  statusMessage: string;
}

const PANELS: { id: SidebarPanel; label: string }[] = [
  { id: "office", label: "Office" },
  { id: "workspace", label: "Workspace" },
  { id: "meeting", label: "Meeting" },
  { id: "finance", label: "Finance" },
  { id: "settings", label: "Settings" },
  { id: "god_mode", label: "God Mode" },
];

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
          <h1>SoulCorp</h1>
          <p className="tagline">AI Company Simulator</p>
        </div>
        <SidebarPanelContent panel={activePanel} />
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
        {children}
        <footer className="status-bar">{statusMessage}</footer>
      </main>
      <PauseMenu />
    </div>
  );
}