import { useState } from "react";
import { furnitureThumbnailPath } from "../../utils/furnitureThumbnail";

interface CatalogChipItem {
  id: string;
  label: string;
  icon?: string;
  thumbnailUrl?: string;
}

interface CatalogChipBarProps {
  items: CatalogChipItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  ariaLabel?: string;
}

function CatalogChipThumb({ item }: { item: CatalogChipItem }) {
  const [failed, setFailed] = useState(false);
  const src = item.thumbnailUrl ?? furnitureThumbnailPath(item.id);

  if (failed) {
    return item.icon ? (
      <span className="catalog-chip-icon" aria-hidden>
        {item.icon}
      </span>
    ) : null;
  }

  return (
    <img
      className="catalog-chip-thumb"
      src={src}
      alt=""
      width={20}
      height={20}
      onError={() => setFailed(true)}
    />
  );
}

export function CatalogChipBar({
  items,
  activeId,
  onSelect,
  ariaLabel = "Furniture catalog",
}: CatalogChipBarProps) {
  return (
    <div className="catalog-chip-bar" role="list" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="listitem"
          className={`catalog-chip${activeId === item.id ? " active" : ""}`}
          onClick={() => onSelect(item.id)}
          title={item.label}
        >
          <CatalogChipThumb item={item} />
          <span className="catalog-chip-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}