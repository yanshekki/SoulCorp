import type { DesignCategory } from "../../types/visualDesign";
import { useI18n } from "../../i18n/I18nProvider";

const CATEGORIES: { id: DesignCategory; labelKey: string; hintKey: string }[] = [
  { id: "campus", labelKey: "design.cat.campus", hintKey: "design.cat.campusHint" },
  { id: "buildings", labelKey: "design.cat.buildings", hintKey: "design.cat.buildingsHint" },
  { id: "offices", labelKey: "design.cat.offices", hintKey: "design.cat.officesHint" },
  { id: "agents", labelKey: "design.cat.agents", hintKey: "design.cat.agentsHint" },
];

const CATEGORY_ICONS: Record<DesignCategory, string> = {
  campus: "🌤",
  buildings: "🏢",
  offices: "🪑",
  agents: "👤",
};

interface DesignCategoryNavProps {
  active: DesignCategory;
  onChange: (category: DesignCategory) => void;
  compact?: boolean;
}

export function DesignCategoryNav({ active, onChange, compact = false }: DesignCategoryNavProps) {
  const { t } = useI18n();
  return (
    <nav
      className={`design-category-nav${compact ? " design-category-nav--compact" : ""}`}
      aria-label={t("design.categoriesAria")}
    >
      {CATEGORIES.map((category) => {
        const label = t(category.labelKey);
        const hint = t(category.hintKey);
        return (
          <button
            key={category.id}
            type="button"
            className={`design-category-btn${active === category.id ? " active" : ""}${compact ? " design-category-btn--compact" : ""}`}
            onClick={() => onChange(category.id)}
            title={t("design.cat.title", { label, hint })}
          >
            {compact ? (
              <>
                <span className="design-category-icon" aria-hidden>
                  {CATEGORY_ICONS[category.id]}
                </span>
                <span className="design-category-compact-label">{label}</span>
              </>
            ) : (
              <>
                <strong>{label}</strong>
                <span>{hint}</span>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}
