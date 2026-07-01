import { useEffect, useState } from "react";
import { catalogEntryIcon } from "../../data/furnitureCatalog";
import type { FurnitureCategory } from "../../types/visualDesign";
import { renderFurniturePreviewUrl } from "../../utils/furniturePreviewRenderer";

interface FurnitureCatalogThumbProps {
  catalogId: string;
  gltfPath: string;
  footprint: [number, number];
  label: string;
  category: FurnitureCategory;
}

export function FurnitureCatalogThumb({
  catalogId,
  gltfPath,
  footprint,
  label,
  category,
}: FurnitureCatalogThumbProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);

    void renderFurniturePreviewUrl(catalogId, gltfPath, footprint).then((url) => {
      if (cancelled) {
        return;
      }
      if (url) {
        setSrc(url);
        return;
      }
      setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [catalogId, gltfPath, footprint]);

  if (src) {
    return (
      <img
        className="design-catalog-item-thumb"
        src={src}
        alt=""
        width={56}
        height={56}
      />
    );
  }

  return (
    <span
      className={`design-catalog-item-thumb design-catalog-item-thumb--placeholder${failed ? " failed" : ""}`}
      aria-hidden
    >
      {catalogEntryIcon({ category })}
      <span className="design-catalog-item-thumb-label">{label}</span>
    </span>
  );
}