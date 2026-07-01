import { useEffect, useState } from "react";
import { formatFootprintDimensions, renderFurniturePlanSilhouette } from "../../utils/furniturePlanSilhouette";

interface FurniturePlanSilhouetteProps {
  catalogId: string;
  gltfPath: string;
  footprint: [number, number];
  showDimensions: boolean;
  title: string;
}

export function FurniturePlanSilhouette({
  catalogId,
  gltfPath,
  footprint,
  showDimensions,
  title,
}: FurniturePlanSilhouetteProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [w, d] = footprint;

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    void renderFurniturePlanSilhouette(catalogId, gltfPath, footprint).then((url) => {
      if (!cancelled && url) {
        setSrc(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [catalogId, gltfPath, footprint]);

  return (
    <>
      {src ? (
        <image
          href={src}
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          className="design-floor-furniture-silhouette"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.08} className="design-floor-furniture-fallback" />
      )}
      <rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        rx={0.08}
        className="design-floor-furniture-hit"
      />
      {showDimensions ? (
        <text
          x={0}
          y={d / 2 + 0.22}
          className="design-floor-furniture-dims"
          fontSize={0.18}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {formatFootprintDimensions(footprint)}
        </text>
      ) : null}
      <title>{title}</title>
    </>
  );
}