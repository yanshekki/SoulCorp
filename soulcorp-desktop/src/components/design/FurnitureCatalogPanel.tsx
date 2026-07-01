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
  { id: "desk", label: "Desks", categories: ["desk"] },
  { id: "seating", label: "Seating", categories: ["chair"] },
  { id: "decor", label: "Decor", categories: ["decor", "plant", "lighting"] },
  { id: "tech", label: "Equipment", categories: ["tech", "storage", "structure"] },
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
        <h2>Furniture catalog</h2>
        <p className="muted">Thumbnails and 3D share the same models. Pick an item, then click in plan or 3D to place.</p>
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
          Place{" "}
          <strong>{FURNITURE_CATALOG.find((e) => e.id === placeCatalogId)?.label}</strong>{" "}
          — click in plan or 3D
        </p>
      ) : null}
    </section>
  );
}