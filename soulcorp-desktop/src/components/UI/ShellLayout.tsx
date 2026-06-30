import type { ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import { Dashboard } from "./Dashboard";
import { PauseMenu } from "./PauseMenu";

interface ShellLayoutProps {
  children: ReactNode;
  statusMessage: string;
}

export function ShellLayout({ children, statusMessage }: ShellLayoutProps) {
  const togglePause = useGameStore((state) => state.togglePause);
  const isPaused = useGameStore((state) => state.isPaused);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>SoulCorp</h1>
          <p className="tagline">AI Company Simulator</p>
        </div>
        <Dashboard />
        <nav className="sidebar-actions">
          <button type="button" className="active">
            Office
          </button>
          <button type="button">Agents</button>
          <button type="button">Workspace</button>
          <button type="button">Settings</button>
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