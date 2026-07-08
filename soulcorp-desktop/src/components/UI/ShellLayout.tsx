import type { ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";
import { appTagline, showPauseMenu, showTierPanel } from "../../config/features";
import { getNextWorkflowPanel, IMMERSIVE_PANELS } from "../../config/navigation";
import { AppHeaderNav } from "./AppHeaderNav";
import { AudioMuteButton } from "./AudioMuteButton";
import { CompanySwitcher } from "./CompanySwitcher";
import { Dashboard } from "./Dashboard";
import { PauseMenu } from "./PauseMenu";
import { TierPanel } from "./TierPanel";
import { TestModeButton } from "./TestModeButton";
import { ObservatoryGlobalPill } from "./observatory/ObservatoryGlobalPill";

interface ShellLayoutProps {
  children: ReactNode;
  statusMessage: string;
}

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

function WorkflowNextStep({ panel }: { panel: SidebarPanel }) {
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const next = getNextWorkflowPanel(panel);
  if (!next) return null;
  const label = next === "meeting" ? "Meeting" : next === "workspace" ? "Workspace" : "Projects";
  return (
    <button type="button" className="workflow-next-btn" onClick={() => setActivePanel(next)}>
      Next: {label} →
    </button>
  );
}

function SidebarPanelContent({ panel }: { panel: SidebarPanel }) {
  switch (panel) {
    case "workspace":
      return (
        <section className="panel-card workspace-guide">
          <h2>Workspace</h2>
          <p className="muted">Deliverables & docs from your workflow.</p>
          <WorkflowNextStep panel="workspace" />
        </section>
      );
    case "meeting":
      return (
        <section className="panel-card meeting-guide">
          <h2>Meeting</h2>
          <p className="muted">Align team before execution.</p>
          <WorkflowNextStep panel="meeting" />
        </section>
      );
    case "projects":
      return (
        <section className="panel-card projects-guide">
          <h2>Projects</h2>
          <p className="muted">Directive → sprint → execute.</p>
          <WorkflowNextStep panel="projects" />
        </section>
      );
    case "finance":
      return (
        <section className="panel-card tokens-guide">
          <h2>Tokens</h2>
          <p className="muted">Pool, wallets, usage.</p>
        </section>
      );
    case "marketplace":
      return (
        <section className="panel-card marketplace-guide">
          <h2>Marketplace</h2>
          <p className="muted">Gigs, contracts, payouts.</p>
        </section>
      );
    case "departments":
      return (
        <section className="panel-card departments-guide">
          <h2>Departments</h2>
          <p className="muted">Teams & reporting lines.</p>
        </section>
      );
    case "recruitment":
      return (
        <section className="panel-card recruitment-guide">
          <h2>Recruitment</h2>
          <p className="muted">Hire & onboard agents.</p>
        </section>
      );
    case "agents":
      return (
        <section className="panel-card agents-guide">
          <h2>Agent Brains</h2>
          <p className="muted">LLM config per agent & department.</p>
        </section>
      );
    case "observatory":
      return (
        <section className="panel-card observatory-guide">
          <h2>Observatory</h2>
          <p className="muted">Live work & thought streams for every agent.</p>
        </section>
      );
    case "tier":
      return showTierPanel ? (
        <TierPanel />
      ) : (
        <section className="panel-card">
          <h2>Pro / VIP</h2>
          <p className="muted">Available in SoulCorp v2.</p>
        </section>
      );
    case "achievements":
      return (
        <section className="panel-card achievements-guide">
          <h2>Achievements</h2>
          <p className="muted">Milestones & endings.</p>
        </section>
      );
    case "design_studio":
      return (
        <section className="panel-card">
          <h2>3D Design Studio</h2>
          <p className="muted">Campus, buildings, interiors, agent looks.</p>
        </section>
      );
    case "settings":
      return (
        <section className="panel-card settings-guide">
          <h2>Settings</h2>
          <p className="muted">Sync, AI providers, backups, deploy.</p>
        </section>
      );
    case "god_mode":
      return (
        <section className="panel-card god-mode-guide">
          <h2>God Mode</h2>
          <p className="muted">CEO intervention powers.</p>
        </section>
      );
    case "office":
    default:
      return <Dashboard />;
  }
}

export function ShellLayout({ children, statusMessage }: ShellLayoutProps) {
  const togglePause = useGameStore((state) => state.togglePause);
  const isPaused = useGameStore((state) => state.isPaused);
  const activePanel = useGameStore((state) => state.activePanel);
  const worldView = useGameStore((state) => state.worldView);
  const inspectorExpanded = useGameStore((state) => state.inspectorExpanded);
  const setInspectorExpanded = useGameStore((state) => state.setInspectorExpanded);
  const immersiveInterior = worldView === "interior" && activePanel === "office";
  const immersiveStage = IMMERSIVE_PANELS.has(activePanel) || immersiveInterior;
  const inspectorDrawerOpen = immersiveInterior && inspectorExpanded;
  const hideShellInspector =
    IMMERSIVE_PANELS.has(activePanel) || (immersiveInterior && !inspectorExpanded);

  return (
    <div
      className={`app-shell${immersiveInterior ? " app-shell--immersive-office" : ""}${immersiveStage ? " app-shell--immersive-stage" : ""}`}
    >
      <header className="app-topbar">
        <div className="app-topbar-row app-topbar-row-primary">
          <div className="app-brand">
            <SidebarTitle />
            <p className="app-tagline">{appTagline}</p>
            <TierBadge />
          </div>
          <div className="app-topbar-actions">
            <AudioMuteButton className="audio-mute-btn app-topbar-mute" />
            <CompanySwitcher />
            {showPauseMenu ? (
              <button type="button" className="app-pause-btn" onClick={togglePause}>
                {isPaused ? "Resume" : "Pause"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="app-topbar-row app-topbar-row-nav">
          <AppHeaderNav />
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

      <footer className="app-statusbar">
        <TestModeButton />
        <ObservatoryGlobalPill />
        <span className="status-message">{statusMessage}</span>
      </footer>

      {showPauseMenu ? <PauseMenu /> : null}
    </div>
  );
}