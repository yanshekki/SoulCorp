import { useMemo } from "react";
import { getCatalogEntry } from "../../data/furnitureCatalog";
import type { Agent } from "../../types/world";
import type { OfficeVisualConfig } from "../../types/visualDesign";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import {
  floorPlanLayout,
  itemToPlanCoords,
  rotatedFootprint,
} from "../../utils/furnitureEditor";
import { useI18n } from "../../i18n/I18nProvider";

const PADDING = 0.8;

interface FallbackFloorPlanProps {
  buildingId: string;
  office: OfficeVisualConfig | undefined;
  agents?: Agent[];
  accentColor?: string;
}

export function FallbackFloorPlan({
  buildingId,
  office,
  agents = [],
  accentColor = "#5ec8ff",
}: FallbackFloorPlanProps) {
  const { t } = useI18n();
  const config = useMemo(
    () => normalizeOfficeVisual(office, buildingId),
    [office, buildingId],
  );
  const layout = useMemo(() => floorPlanLayout(config), [config]);
  const viewBox = `${-PADDING} ${-PADDING} ${layout.maxWidth + PADDING * 2} ${layout.totalDepth + PADDING * 2}`;

  const officeZone = layout.zones.find((zone) => zone.id === "office");
  const deskItems = config.furniture.filter((item) => item.catalog_id.startsWith("desk_"));

  return (
    <svg className="fallback-floor-plan-svg" viewBox={viewBox} role="img" aria-label={t("world.floorPlanAria")}>
      {layout.zones.map((zone) => (
        <g key={zone.id}>
          <rect
            x={zone.x}
            y={zone.y}
            width={zone.width}
            height={zone.depth}
            className={`fallback-floor-zone fallback-floor-zone-${zone.id}`}
            rx={0.12}
          />
          <text x={zone.x + 0.25} y={zone.y + 0.4} className="fallback-floor-zone-label">
            {zone.label}
          </text>
        </g>
      ))}

      {config.furniture.map((item) => {
        const entry = getCatalogEntry(item.catalog_id);
        const coords = itemToPlanCoords(item, layout);
        if (!entry || !coords) {
          return null;
        }
        const [w, d] = rotatedFootprint(entry.footprint, item.rotation_y);
        return (
          <rect
            key={item.id}
            x={coords.x - w / 2}
            y={coords.y - d / 2}
            width={w}
            height={d}
            className="fallback-floor-furniture"
            transform={`rotate(${(item.rotation_y * 180) / Math.PI} ${coords.x} ${coords.y})`}
          >
            <title>{t(`furniture.${entry.id}`)}</title>
          </rect>
        );
      })}

      {agents.map((agent, index) => {
        const desk = deskItems[index % deskItems.length];
        const coords = desk ? itemToPlanCoords(desk, layout) : null;
        if (!coords || !officeZone) {
          return null;
        }
        return (
          <g key={agent.id} className="fallback-floor-agent">
            <circle cx={coords.x} cy={coords.y + 0.35} r={0.18} fill={agent.color} />
            <text x={coords.x} y={coords.y + 0.65} className="fallback-floor-agent-label">
              {agent.name.split(" ")[0]}
            </text>
          </g>
        );
      })}

      <rect
        x={layout.zones[0].x + layout.zones[0].width / 2 - 0.55}
        y={layout.zones[0].y + layout.zones[0].depth - 0.15}
        width={1.1}
        height={0.12}
        className="fallback-floor-exit"
        style={{ fill: accentColor }}
      />
    </svg>
  );
}