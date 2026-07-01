import type { DesignCategory } from "../../types/visualDesign";

const CATEGORIES: { id: DesignCategory; label: string; hint: string }[] = [
  { id: "campus", label: "Campus", hint: "Sky, ground, ambient light" },
  { id: "buildings", label: "Buildings", hint: "Department towers & signage" },
  { id: "offices", label: "Offices", hint: "Interior layout & decor" },
  { id: "agents", label: "Agents", hint: "Employee appearance" },
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
  return (
    <nav
      className={`design-category-nav${compact ? " design-category-nav--compact" : ""}`}
      aria-label="Design categories"
    >
      {CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          className={`design-category-btn${active === category.id ? " active" : ""}${compact ? " design-category-btn--compact" : ""}`}
          onClick={() => onChange(category.id)}
          title={`${category.label} — ${category.hint}`}
        >
          {compact ? (
            <>
              <span className="design-category-icon" aria-hidden>
                {CATEGORY_ICONS[category.id]}
              </span>
              <span className="design-category-compact-label">{category.label}</span>
            </>
          ) : (
            <>
              <strong>{category.label}</strong>
              <span>{category.hint}</span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}