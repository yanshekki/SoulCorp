import { useState } from "react";
import { catalogEntryIcon, FURNITURE_CATALOG, getCatalogEntry } from "../../data/furnitureCatalog";
import { audioDirector } from "../../audio/AudioDirector";
import { saveVisualDesign } from "../../services/visualDesignClient";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import type { BuildTool } from "../../types/buildMode";
import { furnitureThumbnailPath } from "../../utils/furnitureThumbnail";

const TOOLS: Array<{ id: BuildTool; label: string; icon: string }> = [
  { id: "place", label: "Place", icon: "＋" },
  { id: "move", label: "Move", icon: "↔" },
  { id: "rotate", label: "Rotate", icon: "↻" },
  { id: "delete", label: "Delete", icon: "✕" },
];

function CatalogListThumb({ catalogId, icon }: { catalogId: string; icon: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="tph-catalog-item-icon" aria-hidden>
        {icon}
      </span>
    );
  }
  return (
    <img
      className="tph-catalog-item-thumb"
      src={furnitureThumbnailPath(catalogId)}
      alt=""
      width={36}
      height={36}
      onError={() => setFailed(true)}
    />
  );
}

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
    setBuildTool("place");
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
      : "Pick an item from the catalog, then click the floor";

  return (
    <>
      <aside className="tph-catalog-panel" aria-label="Furniture catalog">
        <header className="tph-catalog-header">
          <h3>Items</h3>
          <span className="tph-catalog-count">{FURNITURE_CATALOG.length}</span>
        </header>
        <div className="tph-catalog-list" role="list">
          {FURNITURE_CATALOG.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="listitem"
              className={`tph-catalog-item${buildCatalogId === entry.id && buildTool === "place" ? " active" : ""}`}
              onClick={() => pickCatalog(entry.id)}
              title={entry.label}
            >
              <CatalogListThumb catalogId={entry.id} icon={catalogEntryIcon(entry)} />
              <span className="tph-catalog-item-label">{entry.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <footer className="tph-build-toolbar">
        {placementHint ? (
          <p className="tph-build-hint" aria-live="polite">
            {placementHint}
          </p>
        ) : null}
        <div className="tph-build-tools" role="group" aria-label="Build tools">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={`tph-build-tool${buildTool === tool.id ? " active" : ""}`}
              onClick={() => pickTool(tool.id)}
              title={tool.label}
            >
              <span className="tph-build-tool-icon" aria-hidden>
                {tool.icon}
              </span>
              <span>{tool.label}</span>
            </button>
          ))}
        </div>
        {buildDirty ? (
          <button type="button" className="tph-build-save" onClick={() => void handleSave()}>
            Save layout
          </button>
        ) : null}
      </footer>
    </>
  );
}