import { useEffect, useMemo } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import {
  WORKSPACE_NAV_VIEWS,
  type WorkspaceItemFilter,
  type WorkspaceNavView,
} from "../../types/workspaceNav";
import {
  buildAgentGroups,
  buildFileItems,
  buildPinnedItems,
  buildProjectGroups,
  buildRecentItems,
} from "../../utils/workspaceListItems";
import { useI18n } from "../../i18n/I18nProvider";
import { FolderTree } from "./FolderTree";
import { WorkspaceItemList } from "./WorkspaceItemList";

const FILTER_KEYS: Array<{ id: WorkspaceItemFilter; labelKey: string }> = [
  { id: "all", labelKey: "workspace.filter.all" },
  { id: "pages", labelKey: "workspace.filter.pages" },
  { id: "files", labelKey: "workspace.filter.files" },
];

const VIEW_LABEL_KEY: Record<string, string> = {
  recent: "workspace.view.recent",
  pinned: "workspace.view.pinned",
  projects: "workspace.view.projects",
  agents: "workspace.view.agents",
  files: "workspace.view.files",
  browse: "workspace.view.browse",
};

export function WorkspaceNavigator() {
  const { t } = useI18n();
  const activeView = useWorkspaceStore((state) => state.activeView);
  const itemFilter = useWorkspaceStore((state) => state.itemFilter);
  const organizeMode = useWorkspaceStore((state) => state.organizeMode);
  const tree = useWorkspaceStore((state) => state.tree);
  const pinnedIds = useWorkspaceStore((state) => state.pinnedIds);
  const recent = useWorkspaceStore((state) => state.recent);
  const viewDataRevision = useWorkspaceStore((state) => state.viewDataRevision);
  const loadViewData = useWorkspaceStore((state) => state.loadViewData);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);
  const setItemFilter = useWorkspaceStore((state) => state.setItemFilter);
  const setOrganizeMode = useWorkspaceStore((state) => state.setOrganizeMode);

  useEffect(() => {
    void loadViewData(activeView);
  }, [activeView, recent.length, pinnedIds.length, loadViewData]);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const recentItems = useMemo(
    () => buildRecentItems(tree, recent, pinnedSet, itemFilter),
    [tree, recent, pinnedSet, itemFilter, viewDataRevision],
  );
  const pinnedItems = useMemo(
    () => buildPinnedItems(tree, pinnedIds, itemFilter),
    [tree, pinnedIds, itemFilter, viewDataRevision],
  );
  const fileItems = useMemo(
    () => buildFileItems(tree, pinnedSet, itemFilter),
    [tree, pinnedSet, itemFilter, viewDataRevision],
  );
  const projectGroups = useMemo(
    () => buildProjectGroups(tree, pinnedSet, itemFilter),
    [tree, pinnedSet, itemFilter, viewDataRevision],
  );
  const agentGroups = useMemo(
    () => buildAgentGroups(tree, pinnedSet, itemFilter),
    [tree, pinnedSet, itemFilter, viewDataRevision],
  );

  const showFilters = activeView !== "browse";
  const showOrganizeToggle = activeView === "browse";

  const renderViewContent = () => {
    switch (activeView) {
      case "recent":
        return (
          <WorkspaceItemList
            items={recentItems}
            emptyLabel={t("workspace.empty.recent")}
          />
        );
      case "pinned":
        return (
          <WorkspaceItemList
            items={pinnedItems}
            emptyLabel={t("workspace.empty.pinned")}
          />
        );
      case "projects":
        return (
          <WorkspaceItemList
            groups={projectGroups}
            emptyLabel={t("workspace.empty.projects")}
          />
        );
      case "agents":
        return (
          <WorkspaceItemList
            groups={agentGroups}
            emptyLabel={t("workspace.empty.agents")}
          />
        );
      case "files":
        return (
          <WorkspaceItemList items={fileItems} emptyLabel={t("workspace.empty.files")} />
        );
      case "browse":
      default:
        return <FolderTree organizeMode={organizeMode} />;
    }
  };

  return (
    <div className="ws-navigator">
      <div className="ws-nav-views" role="tablist" aria-label={t("workspace.viewsAria")}>
        {WORKSPACE_NAV_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={activeView === view.id}
            className={`ws-nav-view-tab${activeView === view.id ? " active" : ""}`}
            title={t(VIEW_LABEL_KEY[view.id] ?? view.label)}
            onClick={() => setActiveView(view.id as WorkspaceNavView)}
          >
            <span aria-hidden="true">{view.icon}</span>
            <span className="ws-nav-view-label">{t(VIEW_LABEL_KEY[view.id] ?? view.label)}</span>
          </button>
        ))}
      </div>

      {showFilters || showOrganizeToggle ? (
        <div className="ws-nav-toolbar">
          {showFilters ? (
            <div className="ws-nav-filters" role="group" aria-label={t("workspace.itemFilter")}>
              {FILTER_KEYS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`ws-nav-filter${itemFilter === filter.id ? " active" : ""}`}
                  onClick={() => setItemFilter(filter.id)}
                >
                  {t(filter.labelKey)}
                </button>
              ))}
            </div>
          ) : null}
          {showOrganizeToggle ? (
            <label className="ws-nav-organize">
              <input
                type="checkbox"
                checked={organizeMode}
                onChange={(event) => setOrganizeMode(event.target.checked)}
              />
              {t("workspace.organize")}
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="ws-nav-content">{renderViewContent()}</div>
    </div>
  );
}