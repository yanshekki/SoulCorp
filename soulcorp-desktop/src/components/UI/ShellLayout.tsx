import type { ReactNode } from "react";

interface ShellLayoutProps {
  children: ReactNode;
  statusMessage: string;
}

export function ShellLayout({ children, statusMessage }: ShellLayoutProps) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>SoulCorp</h1>
        <p className="tagline">AI Company Simulator</p>
        <nav>
          <button type="button">Dashboard</button>
          <button type="button">Agents</button>
          <button type="button">Workspace</button>
          <button type="button">Settings</button>
        </nav>
      </aside>
      <main className="main-panel">
        {children}
        <footer className="status-bar">{statusMessage}</footer>
      </main>
    </div>
  );
}