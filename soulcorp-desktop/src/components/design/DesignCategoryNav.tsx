import type { DesignCategory } from "../../types/visualDesign";

const CATEGORIES: { id: DesignCategory; label: string; hint: string }[] = [
  { id: "campus", label: "Campus", hint: "Sky, ground, ambient light" },
  { id: "buildings", label: "Buildings", hint: "Department towers & signage" },
  { id: "offices", label: "Offices", hint: "Interior layout & decor" },
  { id: "agents", label: "Agents", hint: "Employee appearance" },
];

interface DesignCategoryNavProps {
  active: DesignCategory;
  onChange: (category: DesignCategory) => void;
}

export function DesignCategoryNav({ active, onChange }: DesignCategoryNavProps) {
  return (
    <nav className="design-category-nav" aria-label="Design categories">
      {CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          className={`design-category-btn${active === category.id ? " active" : ""}`}
          onClick={() => onChange(category.id)}
        >
          <strong>{category.label}</strong>
          <span>{category.hint}</span>
        </button>
      ))}
    </nav>
  );
}