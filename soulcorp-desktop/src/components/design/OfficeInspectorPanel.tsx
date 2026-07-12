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
import { useI18n } from "../../i18n/I18nProvider";

const ZONE_LABEL_KEYS: Record<InteriorZone, string> = {
  lobby: "design.zone.lobby",
  corridor: "design.zone.corridor",
  office: "design.zone.office",
};

const DRAWER_TABS: Array<{ id: OfficeDrawerTab; labelKey: string }> = [
  { id: "room", labelKey: "design.roomSize" },
  { id: "catalog", labelKey: "design.tool.furniture" },
  { id: "theme", labelKey: "design.tab.theme" },
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
  const { t } = useI18n();
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
        <section className="office-inspector-card" aria-label={t("design.selectedFurniture")}>
          <header className="office-inspector-card-header">
            <h3>{t("design.selectedItem")}</h3>
            <span className="office-inspector-zone">{t(ZONE_LABEL_KEYS[selectedItem.zone])}</span>
          </header>
          <p className="office-inspector-title">{t(`furniture.${selectedEntry.id}`)}</p>
          <dl className="office-inspector-meta">
            <div>
              <dt>{t("design.size")}</dt>
              <dd>{formatFootprintDimensions(selectedEntry.footprint)}</dd>
            </div>
            <div>
              <dt>{t("design.zone")}</dt>
              <dd>{t(ZONE_LABEL_KEYS[selectedItem.zone])}</dd>
            </div>
          </dl>
          <div className="office-inspector-actions">
            <button type="button" className="design-office-tool-btn" onClick={rotateSelected}>
              ⟳ {t("design.rotate")}
            </button>
            <button type="button" className="design-office-tool-btn" onClick={deleteSelected}>
              ✕ {t("design.delete")}
            </button>
          </div>
        </section>
      ) : placingEntry && activeStep === "layout" ? (
        <section className="office-inspector-card office-inspector-card--place" aria-live="polite">
          <h3>{t("design.placementMode")}</h3>
          <p>
            {t("design.placeItem", {
              name: t(`furniture.${placingEntry.id}`),
              size: formatFootprintDimensions(placingEntry.footprint),
            })}
          </p>
          <p className="muted">{t("design.placeHint")}</p>
        </section>
      ) : (
        <section className="office-inspector-card office-inspector-card--hint">
          <p className="muted">
            {activeStep === "size"
              ? t("design.editingZone", { zone: t(ZONE_LABEL_KEYS[activeZone]) })
              : activeStep === "layout"
                ? t("design.pickFurnitureHint")
                : t("design.themeHint")}
          </p>
        </section>
      )}

      <div className="design-drawer-tabs" role="tablist" aria-label={t("design.inspectorPanels")}>
        {DRAWER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={drawerTab === tab.id}
            className={`design-drawer-tab${drawerTab === tab.id ? " active" : ""}`}
            onClick={() => onDrawerTabChange(tab.id)}
          >
            {t(tab.labelKey)}
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