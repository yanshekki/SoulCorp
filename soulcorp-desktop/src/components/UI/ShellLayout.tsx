import type { ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";
import { appTagline, showPauseMenu } from "../../config/features";
import { getNavGroups, getNextWorkflowPanel } from "../../config/navigation";
import { AudioMuteButton } from "./AudioMuteButton";
import { CompanySwitcher } from "./CompanySwitcher";
import { Dashboard } from "./Dashboard";
import { PauseMenu } from "./PauseMenu";
import { TierPanel } from "./TierPanel";
import { TestModeButton } from "./TestModeButton";

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
          <p className="workflow-step-badge">Step 3 · Deliver</p>
          <h2>Workspace</h2>
          <p className="muted">
            Read agent deliverables, meeting notes, and company docs produced by your workflow.
          </p>
          <ul className="workspace-guide-list">
            <li>
              <strong>Deliverables</strong> — open pages created by LLM task execution.
            </li>
            <li>
              <strong>Teams</strong> — department pages, weekly priorities, and journals.
            </li>
            <li>
              <strong>CEO (you)</strong> — edit, link projects, and approve final output.
            </li>
          </ul>
        </section>
      );
    case "meeting":
      return (
        <section className="panel-card meeting-guide">
          <p className="workflow-step-badge">Step 2 · Align</p>
          <h2>Meeting</h2>
          <p className="muted">
            Run multi-agent meetings to align on directives before execution. Notes auto-save to
            Workspace.
          </p>
          <WorkflowNextStep panel="meeting" />
        </section>
      );
    case "projects":
      return (
        <section className="panel-card projects-guide">
          <p className="workflow-step-badge">Step 1 · Plan</p>
          <h2>Projects</h2>
          <p className="muted">
            Start here: issue CEO directives → PM decomposes backlog → plan sprint → assign agents →
            run LLM execution.
          </p>
          <WorkflowNextStep panel="projects" />
        </section>
      );
    case "finance":
      return (
        <section className="panel-card tokens-guide">
          <p className="workflow-step-badge">Step 6 · Budget</p>
          <h2>Tokens</h2>
          <p className="muted">
            Fund LLM execution — token pool, per-agent wallets, usage ledger, and salary controls.
          </p>
        </section>
      );
    case "marketplace":
      return (
        <section className="panel-card marketplace-guide">
          <p className="workflow-step-badge">Step 7 · Revenue</p>
          <h2>Marketplace</h2>
          <p className="muted">
            Turn deliverables into income — post gigs, manage contracts, and track payouts.
          </p>
        </section>
      );
    case "recruitment":
      return (
        <section className="panel-card recruitment-guide">
          <p className="workflow-step-badge">Step 4 · Staff</p>
          <h2>Recruitment</h2>
          <p className="muted">
            Hire agents before scaling execution — browse candidates, interview, and onboard to teams.
          </p>
        </section>
      );
    case "agents":
      return (
        <section className="panel-card agents-guide">
          <p className="workflow-step-badge">Step 5 · Configure</p>
          <h2>Agent Brains</h2>
          <p className="muted">
            Set department LLM defaults and per-employee overrides before running tasks.
          </p>
        </section>
      );
    case "tier":
      return <TierPanel />;
    case "executive":
      return (
        <section className="panel-card vip-executive-guide">
          <h2>VIP Executive</h2>
          <p className="muted">
            Custom departments and AI Co-CEO controls live in the main stage.
          </p>
        </section>
      );
    case "achievements":
      return (
        <section className="panel-card achievements-guide">
          <h2>Achievements</h2>
          <p className="muted">
            Milestones, category progress, and alternate endings live in the main stage.
          </p>
        </section>
      );
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
      return (
        <section className="panel-card settings-guide">
          <h2>Settings</h2>
          <p className="muted">
            Configure cloud sync, AI providers, backups, and deploy in the main stage.
          </p>
        </section>
      );
    case "god_mode":
      return (
        <section className="panel-card god-mode-guide">
          <h2>God Mode</h2>
          <p className="muted">
            CEO intervention powers, reality debt, and intervention log live in the main stage.
          </p>
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
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const worldView = useGameStore((state) => state.worldView);
  const inspectorExpanded = useGameStore((state) => state.inspectorExpanded);
  const setInspectorExpanded = useGameStore((state) => state.setInspectorExpanded);
  const navGroups = getNavGroups();

  const immersiveInterior = worldView === "interior" && activePanel === "office";
  const immersiveDesignStudio = activePanel === "design_studio";
  const immersiveSettings = activePanel === "settings";
  const immersiveGodMode = activePanel === "god_mode";
  const immersiveAchievements = activePanel === "achievements";
  const immersiveExecutive = activePanel === "executive";
  const immersiveAgents = activePanel === "agents";
  const immersiveRecruitment = activePanel === "recruitment";
  const immersiveMarketplace = activePanel === "marketplace";
  const immersiveTokens = activePanel === "finance";
  const immersiveMeeting = activePanel === "meeting";
  const immersiveProjects = activePanel === "projects";
  const immersiveWorkspace = activePanel === "workspace";
  const immersiveStage =
    immersiveInterior ||
    immersiveDesignStudio ||
    immersiveSettings ||
    immersiveGodMode ||
    immersiveAchievements ||
    immersiveExecutive ||
    immersiveAgents ||
    immersiveRecruitment ||
    immersiveMarketplace ||
    immersiveTokens ||
    immersiveMeeting ||
    immersiveProjects ||
    immersiveWorkspace;
  const inspectorDrawerOpen = immersiveInterior && inspectorExpanded;
  const hideShellInspector =
    immersiveDesignStudio ||
    immersiveSettings ||
    immersiveGodMode ||
    immersiveAchievements ||
    immersiveExecutive ||
    immersiveAgents ||
    immersiveRecruitment ||
    immersiveMarketplace ||
    immersiveTokens ||
    immersiveMeeting ||
    immersiveProjects ||
    immersiveWorkspace ||
    (immersiveInterior && !inspectorExpanded);

  return (
    <div
      className={`app-shell${immersiveInterior ? " app-shell--immersive-office" : ""}${immersiveDesignStudio ? " app-shell--design-studio" : ""}${immersiveSettings ? " app-shell--settings" : ""}${immersiveGodMode ? " app-shell--god-mode" : ""}${immersiveAchievements ? " app-shell--achievements" : ""}${immersiveExecutive ? " app-shell--executive" : ""}${immersiveAgents ? " app-shell--agents" : ""}${immersiveRecruitment ? " app-shell--recruitment" : ""}${immersiveMarketplace ? " app-shell--marketplace" : ""}${immersiveTokens ? " app-shell--tokens" : ""}${immersiveMeeting ? " app-shell--meeting" : ""}${immersiveProjects ? " app-shell--projects" : ""}${immersiveWorkspace ? " app-shell--workspace" : ""}`}
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
          <nav className="app-nav" aria-label="Main navigation">
            {navGroups.map((group) => (
              <div
                key={group.label}
                className={`nav-group${group.isWorkflow ? " nav-group--workflow" : ""}`}
                role="group"
                aria-label={group.label}
              >
                <span className="nav-group-label">{group.label}</span>
                {group.panels.map((panel, panelIndex) => (
                  <span key={panel.id} className="nav-item-wrap">
                    {group.isWorkflow && panelIndex > 0 ? (
                      <span className="nav-flow-connector" aria-hidden="true">
                        →
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={`nav-btn${activePanel === panel.id ? " active" : ""}${panel.workflowStep != null ? " nav-btn--workflow" : ""}`}
                      onClick={() => setActivePanel(panel.id)}
                      title={panel.workflowHint}
                    >
                      {panel.workflowStep != null ? (
                        <span className="nav-btn-step">{panel.workflowStep}</span>
                      ) : null}
                      {panel.label}
                    </button>
                  </span>
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

      <footer className="app-statusbar">
        <TestModeButton />
        <span className="status-message">{statusMessage}</span>
      </footer>

      {showPauseMenu ? <PauseMenu /> : null}
    </div>
  );
}