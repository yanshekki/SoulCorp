import { catalogEntryIcon, FURNITURE_CATALOG } from "../../data/furnitureCatalog";
import type { FurnitureCategory } from "../../types/visualDesign";
import { CatalogChipBar } from "../UI/CatalogChipBar";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { FurnitureCatalogThumb } from "./FurnitureCatalogThumb";

const CATEGORY_SECTIONS: Array<{
  id: FurnitureCategory | "seating";
  label: string;
  categories: FurnitureCategory[];
}> = [
  { id: "desk", label: "枱檯", categories: ["desk"] },
  { id: "seating", label: "座椅", categories: ["chair"] },
  { id: "decor", label: "裝飾", categories: ["decor", "plant", "lighting"] },
  { id: "tech", label: "設備", categories: ["tech", "storage", "structure"] },
];

interface FurnitureCatalogPanelProps {
  variant?: "grid" | "chips";
}

export function FurnitureCatalogPanel({ variant = "grid" }: FurnitureCatalogPanelProps) {
  const placeCatalogId = useDesignStudioStore((state) => state.placeCatalogId);
  const setPlaceCatalogId = useDesignStudioStore((state) => state.setPlaceCatalogId);

  const toggleCatalog = (catalogId: string) => {
    setPlaceCatalogId(placeCatalogId === catalogId ? null : catalogId);
  };

  return (
    <section className="design-panel design-catalog-panel">
      <header>
        <h2>傢俬目錄</h2>
        <p className="muted">預覽圖同 3D 用同一套模型。揀一件，喺平面圖或 3D 撳一下放置。</p>
      </header>

      {variant === "chips"
        ? CATEGORY_SECTIONS.map((section) => {
            const items = FURNITURE_CATALOG.filter((entry) =>
              section.categories.includes(entry.category),
            );
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={section.id} className="design-catalog-section">
                <h3>{section.label}</h3>
                <CatalogChipBar
                  items={items.map((entry) => ({
                    id: entry.id,
                    label: entry.label,
                    icon: catalogEntryIcon(entry),
                  }))}
                  activeId={placeCatalogId}
                  onSelect={toggleCatalog}
                  ariaLabel={`${section.label} furniture`}
                />
              </div>
            );
          })
        : null}

      {variant === "grid"
        ? CATEGORY_SECTIONS.map((section) => {
            const items = FURNITURE_CATALOG.filter((entry) =>
              section.categories.includes(entry.category),
            );
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={section.id} className="design-catalog-section">
                <h3>{section.label}</h3>
                <div className="design-catalog-grid">
                  {items.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`design-catalog-item${placeCatalogId === entry.id ? " active" : ""}`}
                      onClick={() => toggleCatalog(entry.id)}
                      title={`${entry.footprint[0]}m × ${entry.footprint[1]}m`}
                    >
                      <FurnitureCatalogThumb
                        catalogId={entry.id}
                        gltfPath={entry.gltfPath}
                        footprint={entry.footprint}
                        label={entry.label}
                        category={entry.category}
                      />
                      <strong>{entry.label}</strong>
                      <span>
                        {entry.footprint[0].toFixed(1)}×{entry.footprint[1].toFixed(1)}m
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        : null}

      {placeCatalogId ? (
        <p className="design-catalog-place-hint muted">
          放置{" "}
          <strong>{FURNITURE_CATALOG.find((e) => e.id === placeCatalogId)?.label}</strong>{" "}
          — 平面或 3D 撳一下
        </p>
      ) : null}
    </section>
  );
}