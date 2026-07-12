import type { ReactNode } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";
import { appTagline, showPauseMenu, showTierPanel } from "../../config/features";
import { IMMERSIVE_PANELS } from "../../config/navigation";
import { AppHeaderNav } from "./AppHeaderNav";
import { WorkflowNextButton } from "./WorkflowNextButton";
import { AudioMuteButton } from "./AudioMuteButton";
import { CompanySwitcher } from "./CompanySwitcher";
import { Dashboard } from "./Dashboard";
import { PauseMenu } from "./PauseMenu";
import { TierPanel } from "./TierPanel";
import { TestModeButton } from "./TestModeButton";
import { LlmLiveFooterButton } from "./LlmLiveFooterButton";
import { ObservatoryGlobalPill } from "./observatory/ObservatoryGlobalPill";
import { useI18n } from "../../i18n/I18nProvider";

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

function GuideCard({
  className,
  titleKey,
  guideKey,
  nextPanel,
}: {
  className: string;
  titleKey: string;
  guideKey: string;
  nextPanel?: SidebarPanel;
}) {
  const { t } = useI18n();
  return (
    <section className={className}>
      <h2>{t(titleKey)}</h2>
      <p className="muted">{t(guideKey)}</p>
      {nextPanel ? <WorkflowNextButton panel={nextPanel} className="workflow-next-btn" /> : null}
    </section>
  );
}

function SidebarPanelContent({ panel }: { panel: SidebarPanel }) {
  switch (panel) {
    case "workspace":
      return (
        <GuideCard
          className="panel-card workspace-guide"
          titleKey="nav.workspace"
          guideKey="shell.guide.workspace"
          nextPanel="workspace"
        />
      );
    case "meeting":
      return (
        <GuideCard
          className="panel-card meeting-guide"
          titleKey="nav.meeting"
          guideKey="shell.guide.meeting"
          nextPanel="meeting"
        />
      );
    case "projects":
      return (
        <GuideCard
          className="panel-card projects-guide"
          titleKey="nav.projects"
          guideKey="shell.guide.projects"
          nextPanel="projects"
        />
      );
    case "finance":
      return (
        <GuideCard
          className="panel-card tokens-guide"
          titleKey="nav.finance"
          guideKey="shell.guide.finance"
          nextPanel="finance"
        />
      );
    case "marketplace":
      return (
        <GuideCard
          className="panel-card marketplace-guide"
          titleKey="nav.marketplace"
          guideKey="shell.guide.marketplace"
        />
      );
    case "departments":
      return (
        <GuideCard
          className="panel-card departments-guide"
          titleKey="nav.departments"
          guideKey="shell.guide.departments"
          nextPanel="departments"
        />
      );
    case "recruitment":
      return (
        <GuideCard
          className="panel-card recruitment-guide"
          titleKey="nav.recruitment"
          guideKey="shell.guide.recruitment"
          nextPanel="recruitment"
        />
      );
    case "agents":
      return (
        <GuideCard
          className="panel-card agents-guide"
          titleKey="nav.agents"
          guideKey="shell.guide.agents"
          nextPanel="agents"
        />
      );
    case "observatory":
      return (
        <GuideCard
          className="panel-card observatory-guide"
          titleKey="nav.observatory"
          guideKey="shell.guide.observatory"
          nextPanel="observatory"
        />
      );
    case "tier":
      return showTierPanel ? (
        <TierPanel />
      ) : (
        <GuideCard className="panel-card" titleKey="nav.tier" guideKey="shell.guide.tier" />
      );
    case "achievements":
      return (
        <GuideCard
          className="panel-card achievements-guide"
          titleKey="nav.achievements"
          guideKey="shell.guide.achievements"
        />
      );
    case "design_studio":
      return (
        <GuideCard
          className="panel-card"
          titleKey="nav.design_studio.full"
          guideKey="shell.guide.design_studio"
        />
      );
    case "settings":
      return (
        <GuideCard
          className="panel-card settings-guide"
          titleKey="nav.settings"
          guideKey="shell.guide.settings"
        />
      );
    case "god_mode":
      return (
        <GuideCard
          className="panel-card god-mode-guide"
          titleKey="nav.god_mode"
          guideKey="shell.guide.god_mode"
        />
      );
    case "office":
    default:
      return <Dashboard />;
  }
}

export function ShellLayout({ children, statusMessage }: ShellLayoutProps) {
  const { t } = useI18n();
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
                {isPaused ? t("shell.resume") : t("shell.pause")}
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
            aria-label={t("shell.closeInspector")}
          />
        ) : null}
        {!hideShellInspector ? (
          <aside
            className={`app-inspector${inspectorDrawerOpen ? " app-inspector--immersive-drawer" : ""}`}
            aria-label={t("shell.inspectorPanel")}
          >
            {inspectorDrawerOpen ? (
              <button
                type="button"
                className="app-inspector-collapse-btn"
                onClick={() => setInspectorExpanded(false)}
                aria-label={t("shell.hideInspector")}
                title={t("shell.hideInspector")}
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
            aria-label={t("shell.showInspector")}
            title={t("shell.showInspector")}
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
        <LlmLiveFooterButton />
        <ObservatoryGlobalPill />
        <span className="status-message">{statusMessage}</span>
      </footer>

      {showPauseMenu ? <PauseMenu /> : null}
    </div>
  );
}