import { catalogEntryIcon, FURNITURE_CATALOG, getCatalogEntry } from "../../data/furnitureCatalog";
import { audioDirector } from "../../audio/AudioDirector";
import { saveVisualDesign } from "../../services/visualDesignClient";
import { CatalogChipBar } from "../UI/CatalogChipBar";
import { CollapsibleDock } from "../UI/CollapsibleDock";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import type { BuildTool } from "../../types/buildMode";

const TOOLS: Array<{ id: BuildTool; label: string; icon: string }> = [
  { id: "place", label: "Place", icon: "＋" },
  { id: "move", label: "Move", icon: "↔" },
  { id: "rotate", label: "Rotate", icon: "↻" },
  { id: "delete", label: "Delete", icon: "✕" },
];

export function BuildModeHud() {
  const buildMode = useGameStore((state) => state.buildMode);
  const buildTool = useGameStore((state) => state.buildTool);
  const buildCatalogId = useGameStore((state) => state.buildCatalogId);
  const buildDirty = useGameStore((state) => state.buildDirty);
  const hoveredFurnitureId = useGameStore((state) => state.hoveredFurnitureId);
  const selectedFurnitureId = useGameStore((state) => state.selectedFurnitureId);
  const interiorBuildingId = useGameStore((state) => state.interiorBuildingId);
  const visualDesign = useGameStore((state) => state.visualDesign);
  const setBuildTool = useGameStore((state) => state.setBuildTool);
  const setBuildCatalogId = useGameStore((state) => state.setBuildCatalogId);
  const setBuildDirty = useGameStore((state) => state.setBuildDirty);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  if (buildMode !== "build" || !interiorBuildingId) {
    return null;
  }

  const office = visualDesign.offices[interiorBuildingId];
  const hoveredItem = office?.furniture.find((item) => item.id === hoveredFurnitureId);
  const selectedItem = office?.furniture.find((item) => item.id === selectedFurnitureId);
  const tooltipItem = selectedItem ?? hoveredItem;
  const tooltipEntry = tooltipItem ? getCatalogEntry(tooltipItem.catalog_id) : null;

  const pickTool = (tool: BuildTool) => {
    audioDirector.playSfx("ui_click");
    setBuildTool(tool);
  };

  const pickCatalog = (catalogId: string) => {
    audioDirector.playSfx("ui_click");
    setBuildCatalogId(catalogId);
  };

  const handleSave = async () => {
    try {
      const saved = await saveVisualDesign(visualDesign);
      useGameStore.getState().setVisualDesign(saved);
      useDesignStudioStore.getState().setDraft(saved);
      setBuildDirty(false);
      setStatusMessage("Office layout saved.");
      audioDirector.playSfx("save_success");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const placementHint = tooltipEntry
    ? `${tooltipEntry.label} · ${tooltipItem?.zone} · ${tooltipEntry.footprint[0].toFixed(1)}×${tooltipEntry.footprint[1].toFixed(1)}m`
    : buildTool === "place" && buildCatalogId
      ? `${getCatalogEntry(buildCatalogId)?.label ?? buildCatalogId} — click floor to place`
      : null;

  const catalogItems = FURNITURE_CATALOG.map((entry) => ({
    id: entry.id,
    label: entry.label,
    icon: catalogEntryIcon(entry),
  }));

  return (
    <CollapsibleDock className="build-mode-dock" hint={placementHint}>
      <div className="build-mode-tools build-mode-tools--horizontal">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`build-mode-tool${buildTool === tool.id ? " active" : ""}`}
            onClick={() => pickTool(tool.id)}
            title={tool.label}
          >
            <span className="build-mode-tool-icon">{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      <CatalogChipBar
        items={catalogItems}
        activeId={buildTool === "place" ? buildCatalogId : null}
        onSelect={pickCatalog}
      />

      {buildDirty ? (
        <button type="button" className="primary-action build-mode-save" onClick={() => void handleSave()}>
          Save
        </button>
      ) : null}
    </CollapsibleDock>
  );
}