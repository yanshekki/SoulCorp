import { useMemo } from "react";
import { prefetchPanel } from "../../config/lazyPanels";
import { getNavGroups, isPanelVisibleInEdition } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import type { SidebarPanel } from "../../types/game";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { useGameStore } from "../../stores/gameStore";

const GROUP_KEY: Record<string, string> = {
  Workflow: "nav.group.workflow",
  "Team & Budget": "nav.group.teamBudget",
  Growth: "nav.group.growth",
  System: "nav.group.system",
  Creative: "nav.group.creative",
  Account: "nav.group.account",
  Campus: "nav.group.workflow",
};

function panelLabelKey(id: string): string {
  return `nav.${id}`;
}

function panelHintKey(id: string): string {
  return `nav.${id}.hint`;
}

export function AppHeaderNav() {
  const { t } = useI18n();
  const activePanel = useGameStore((state) => state.activePanel);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const activeCount = useMemo(
    () => sessions.filter((session) => session.status === "active").length,
    [sessions],
  );
  const navGroups = getNavGroups();

  return (
    <div className="app-nav-scroll">
      <nav className="app-nav" aria-label={t("shell.mainNav")}>
        {navGroups.map((group) => {
          const panels = group.panels.filter((panel) => isPanelVisibleInEdition(panel.id));
          if (panels.length === 0) {
            return null;
          }
          const groupLabel = t(GROUP_KEY[group.label] ?? group.label) || group.label;

          return (
            <div
              key={group.label}
              className={`nav-group${group.isWorkflow ? " nav-group--workflow" : ""}`}
              role="group"
              aria-label={groupLabel}
            >
              <span className="nav-group-label">{groupLabel}</span>
              <div className="nav-group-items">
                {panels.map((panel, panelIndex) => {
                  const previous = panels[panelIndex - 1];
                  const showConnector =
                    (group.isWorkflow && panelIndex > 0) ||
                    (previous?.workflowStep != null && panel.workflowStep != null);
                  const label = t(panelLabelKey(panel.id));
                  const hintKey = panelHintKey(panel.id);
                  const hintRaw = t(hintKey);
                  const hint = hintRaw === hintKey ? (panel.workflowHint ?? label) : hintRaw;

                  return (
                    <span key={panel.id} className="nav-item-wrap">
                      {showConnector ? (
                        <span className="nav-flow-connector" aria-hidden="true">
                          →
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className={`nav-btn${activePanel === panel.id ? " active" : ""}${panel.workflowStep != null ? " nav-btn--workflow" : " nav-btn--plain"}`}
                        onClick={() => setActivePanel(panel.id)}
                        onMouseEnter={() => prefetchPanel(panel.id as SidebarPanel)}
                        onFocus={() => prefetchPanel(panel.id as SidebarPanel)}
                        title={hint}
                      >
                        {panel.workflowStep != null ? (
                          <span className="nav-btn-step">{panel.workflowStep}</span>
                        ) : null}
                        <span className="nav-btn-label">{label === panelLabelKey(panel.id) ? panel.label : label}</span>
                        {panel.id === "observatory" && activeCount > 0 ? (
                          <span className="nav-btn-live" aria-label={`${activeCount} live sessions`}>
                            <span className="nav-btn-live-dot" aria-hidden="true" />
                            {activeCount}
                          </span>
                        ) : null}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
