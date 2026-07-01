import { getCatalogEntry } from "../../data/furnitureCatalog";
import { useOfficeBuildActions } from "../../hooks/useOfficeBuildActions";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { formatFootprintDimensions } from "../../utils/furniturePlanSilhouette";
import type { InteriorZone } from "../../types/visualDesign";
import { FurnitureCatalogPanel } from "./FurnitureCatalogPanel";
import { OfficeDesignPanel } from "./OfficeDesignPanel";
import type { OfficeDesignStep, OfficeDrawerTab } from "./OfficeBuildToolbar";
import { RoomDimensionsPanel } from "./RoomDimensionsPanel";

const ZONE_LABELS: Record<InteriorZone, string> = {
  lobby: "Lobby",
  corridor: "Corridor",
  office: "Office",
};

const DRAWER_TABS: Array<{ id: OfficeDrawerTab; label: string }> = [
  { id: "room", label: "Room size" },
  { id: "catalog", label: "Furniture" },
  { id: "theme", label: "Theme" },
];

interface OfficeInspectorPanelProps {
  activeStep: OfficeDesignStep;
  drawerTab: OfficeDrawerTab;
  onDrawerTabChange: (tab: OfficeDrawerTab) => void;
}

export function OfficeInspectorPanel({
  activeStep,
  drawerTab,
  onDrawerTabChange,
}: OfficeInspectorPanelProps) {
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const activeZone = useDesignStudioStore((state) => state.activeZone);
  const placeCatalogId = useDesignStudioStore((state) => state.placeCatalogId);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const { config, selectedFurnitureId, selectedEntry, rotateSelected, deleteSelected } =
    useOfficeBuildActions(buildingId);

  const selectedItem = selectedFurnitureId
    ? config.furniture.find((item) => item.id === selectedFurnitureId)
    : null;
  const placingEntry = placeCatalogId ? getCatalogEntry(placeCatalogId) : null;

  return (
    <div className="office-inspector-panel">
      {selectedItem && selectedEntry ? (
        <section className="office-inspector-card" aria-label="Selected furniture">
          <header className="office-inspector-card-header">
            <h3>Selected item</h3>
            <span className="office-inspector-zone">{ZONE_LABELS[selectedItem.zone]}</span>
          </header>
          <p className="office-inspector-title">{selectedEntry.label}</p>
          <dl className="office-inspector-meta">
            <div>
              <dt>Size</dt>
              <dd>{formatFootprintDimensions(selectedEntry.footprint)}</dd>
            </div>
            <div>
              <dt>Zone</dt>
              <dd>{ZONE_LABELS[selectedItem.zone]}</dd>
            </div>
          </dl>
          <div className="office-inspector-actions">
            <button type="button" className="design-office-tool-btn" onClick={rotateSelected}>
              ⟳ Rotate
            </button>
            <button type="button" className="design-office-tool-btn" onClick={deleteSelected}>
              ✕ Delete
            </button>
          </div>
        </section>
      ) : placingEntry && activeStep === "layout" ? (
        <section className="office-inspector-card office-inspector-card--place" aria-live="polite">
          <h3>Placement mode</h3>
          <p>
            Place <strong>{placingEntry.label}</strong> ({formatFootprintDimensions(placingEntry.footprint)})
          </p>
          <p className="muted">Click on the floor plan or 3D view · drag to move furniture</p>
        </section>
      ) : (
        <section className="office-inspector-card office-inspector-card--hint">
          <p className="muted">
            {activeStep === "size"
              ? `Editing ${ZONE_LABELS[activeZone]} dimensions`
              : activeStep === "layout"
                ? "Pick furniture from the catalog · or click existing items in plan/3D"
                : "Adjust color theme · split view updates live"}
          </p>
        </section>
      )}

      <div className="design-drawer-tabs" role="tablist" aria-label="Office inspector panels">
        {DRAWER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={drawerTab === tab.id}
            className={`design-drawer-tab${drawerTab === tab.id ? " active" : ""}`}
            onClick={() => onDrawerTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="office-inspector-body">
        {drawerTab === "catalog" ? <FurnitureCatalogPanel variant="grid" /> : null}
        {drawerTab === "room" ? <RoomDimensionsPanel /> : null}
        {drawerTab === "theme" ? <OfficeDesignPanel /> : null}
      </div>
    </div>
  );
}