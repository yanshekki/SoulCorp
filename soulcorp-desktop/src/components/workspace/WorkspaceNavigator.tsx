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
import { FolderTree } from "./FolderTree";
import { WorkspaceItemList } from "./WorkspaceItemList";

const FILTERS: Array<{ id: WorkspaceItemFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pages", label: "Pages" },
  { id: "files", label: "Files" },
];

export function WorkspaceNavigator() {
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
            emptyLabel="Open a page or file to see it here"
          />
        );
      case "pinned":
        return (
          <WorkspaceItemList
            items={pinnedItems}
            emptyLabel="Pin items with ☆ or right-click"
          />
        );
      case "projects":
        return (
          <WorkspaceItemList
            groups={projectGroups}
            emptyLabel="No project or team docs yet"
          />
        );
      case "agents":
        return (
          <WorkspaceItemList
            groups={agentGroups}
            emptyLabel="Agent folders appear as employees join"
          />
        );
      case "files":
        return (
          <WorkspaceItemList items={fileItems} emptyLabel="Upload files to get started" />
        );
      case "browse":
      default:
        return <FolderTree organizeMode={organizeMode} />;
    }
  };

  return (
    <div className="ws-navigator">
      <div className="ws-nav-views" role="tablist" aria-label="Workspace views">
        {WORKSPACE_NAV_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={activeView === view.id}
            className={`ws-nav-view-tab${activeView === view.id ? " active" : ""}`}
            title={view.label}
            onClick={() => setActiveView(view.id as WorkspaceNavView)}
          >
            <span aria-hidden="true">{view.icon}</span>
            <span className="ws-nav-view-label">{view.label}</span>
          </button>
        ))}
      </div>

      {showFilters || showOrganizeToggle ? (
        <div className="ws-nav-toolbar">
          {showFilters ? (
            <div className="ws-nav-filters" role="group" aria-label="Item filter">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`ws-nav-filter${itemFilter === filter.id ? " active" : ""}`}
                  onClick={() => setItemFilter(filter.id)}
                >
                  {filter.label}
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
              Organize
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="ws-nav-content">{renderViewContent()}</div>
    </div>
  );
}