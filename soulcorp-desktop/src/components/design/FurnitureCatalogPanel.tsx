import { catalogEntryIcon, FURNITURE_CATALOG } from "../../data/furnitureCatalog";
import type { FurnitureCategory } from "../../types/visualDesign";
import { CatalogChipBar } from "../UI/CatalogChipBar";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { FurnitureCatalogThumb } from "./FurnitureCatalogThumb";
import { useI18n } from "../../i18n/I18nProvider";

const CATEGORY_SECTIONS: Array<{
  id: FurnitureCategory | "seating";
  labelKey: string;
  categories: FurnitureCategory[];
}> = [
  { id: "desk", labelKey: "design.furnSection.desk", categories: ["desk"] },
  { id: "seating", labelKey: "design.furnSection.seating", categories: ["chair"] },
  { id: "decor", labelKey: "design.furnSection.decor", categories: ["decor", "plant", "lighting"] },
  { id: "tech", labelKey: "design.furnSection.tech", categories: ["tech", "storage", "structure"] },
];

interface FurnitureCatalogPanelProps {
  variant?: "grid" | "chips";
}

export function FurnitureCatalogPanel({
  variant = "grid",
}: FurnitureCatalogPanelProps) {
  const { t } = useI18n();
  const placeCatalogId = useDesignStudioStore((state) => state.placeCatalogId);
  const setPlaceCatalogId = useDesignStudioStore((state) => state.setPlaceCatalogId);

  const toggleCatalog = (catalogId: string) => {
    setPlaceCatalogId(placeCatalogId === catalogId ? null : catalogId);
  };

  return (
    <section className="design-panel design-catalog-panel">
      <header>
        <h2>{t("design.furnitureCatalog")}</h2>
        <p className="muted">{t("design.furnitureCatalogDesc")}</p>
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
                <h3>{t(section.labelKey)}</h3>
                <CatalogChipBar
                  items={items.map((entry) => ({
                    id: entry.id,
                    label: t(`furniture.${entry.id}`),
                    icon: catalogEntryIcon(entry),
                  }))}
                  activeId={placeCatalogId}
                  onSelect={toggleCatalog}
                  ariaLabel={t("design.furnSection.aria", { section: t(section.labelKey) })}
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
                <h3>{t(section.labelKey)}</h3>
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
                        label={t(`furniture.${entry.id}`)}
                        category={entry.category}
                      />
                      <strong>{t(`furniture.${entry.id}`)}</strong>
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