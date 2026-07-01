import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCatalogEntry } from "../../data/furnitureCatalog";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { DEFAULT_OFFICE_VISUAL, type FurnitureInstance } from "../../types/visualDesign";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import {
  floorPlanLayout,
  isFurniturePlacementValid,
  itemToPlanCoords,
  moveInstance,
  placeFromPlanPoint,
  planCoordsToItemPosition,
  pointInFurniturePlan,
  zoneAtPlanPoint,
  zoneDimensions,
  type FloorPlanZone,
} from "../../utils/placementEngine";
import {
  clampToZone,
  FLOOR_PLAN_COARSE_GRID,
  FLOOR_PLAN_FINE_GRID,
} from "../../utils/furnitureEditor";
import { formatFootprintDimensions } from "../../utils/furniturePlanSilhouette";
import {
  createWallSegment,
  officeArchitecture,
  snapWallPoint,
  wallSegmentLength,
  wallsOnFloor,
} from "../../utils/officeArchitecture";
import { FurniturePlanSilhouette } from "./FurniturePlanSilhouette";

const PLAN_PADDING = 1.2;

const ZONE_MARKERS: Record<FloorPlanZone["id"], string> = {
  lobby: "L",
  corridor: "C",
  office: "O",
};

function hitFurnitureAtPoint(
  items: FurnitureInstance[],
  layout: ReturnType<typeof floorPlanLayout>,
  planX: number,
  planY: number,
): FurnitureInstance | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const entry = getCatalogEntry(item.catalog_id);
    const zone = layout.zones.find((entry) => entry.id === item.zone);
    if (!entry || !zone) {
      continue;
    }
    if (pointInFurniturePlan(planX, planY, item, entry.footprint, zone)) {
      return item;
    }
  }
  return null;
}

export function OfficeFloorPlanEditor() {
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const draft = useDesignStudioStore((state) => state.draft);
  const activeZone = useDesignStudioStore((state) => state.activeZone);
  const selectedFurnitureId = useDesignStudioStore((state) => state.selectedFurnitureId);
  const placeCatalogId = useDesignStudioStore((state) => state.placeCatalogId);
  const setActiveZone = useDesignStudioStore((state) => state.setActiveZone);
  const setSelectedFurnitureId = useDesignStudioStore((state) => state.setSelectedFurnitureId);
  const setPlaceCatalogId = useDesignStudioStore((state) => state.setPlaceCatalogId);
  const updateFurniture = useDesignStudioStore((state) => state.updateFurniture);
  const planTool = useDesignStudioStore((state) => state.planTool);
  const activeArchitectureFloor = useDesignStudioStore((state) => state.activeArchitectureFloor);
  const selectedWallId = useDesignStudioStore((state) => state.selectedWallId);
  const wallDrawAnchor = useDesignStudioStore((state) => state.wallDrawAnchor);
  const setSelectedWallId = useDesignStudioStore((state) => state.setSelectedWallId);
  const setWallDrawAnchor = useDesignStudioStore((state) => state.setWallDrawAnchor);
  const patchOfficeDraft = useDesignStudioStore((state) => state.patchOfficeDraft);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    position: [number, number, number];
    valid: boolean;
  } | null>(null);
  const [placementHint, setPlacementHint] = useState<string | null>(null);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const config = useMemo(
    () => normalizeOfficeVisual(draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL, buildingId),
    [draft.offices, buildingId],
  );
  const layout = useMemo(() => floorPlanLayout(config), [config]);
  const architecture = useMemo(() => officeArchitecture(config), [config]);
  const visibleWalls = useMemo(
    () => wallsOnFloor(architecture, activeArchitectureFloor),
    [architecture, activeArchitectureFloor],
  );

  const viewBox = `${-PLAN_PADDING} ${-PLAN_PADDING} ${layout.maxWidth + PLAN_PADDING * 2} ${layout.totalDepth + PLAN_PADDING * 2}`;

  const clientToPlan = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const svg = svgRef.current;
      if (!svg) {
        return null;
      }
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) {
        return null;
      }
      const local = point.matrixTransform(ctm.inverse());
      return [local.x, local.y];
    },
    [],
  );

  const placementBlockedHint = "呢度冇位 — 每件傢俬都要有自己嘅面積，唔可以疊住";

  const removeWall = useCallback(
    (wallId: string) => {
      patchOfficeDraft(buildingId, {
        architecture: {
          ...architecture,
          walls: architecture.walls.filter((wall) => wall.id !== wallId),
        },
      });
      setSelectedWallId(null);
      setWallDrawAnchor(null);
    },
    [architecture, buildingId, patchOfficeDraft, setSelectedWallId, setWallDrawAnchor],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      if (!(event.target instanceof HTMLInputElement) && selectedWallId) {
        event.preventDefault();
        removeWall(selectedWallId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removeWall, selectedWallId]);

  const wallAtPoint = useCallback(
    (planX: number, planY: number) => {
      const threshold = 0.22;
      for (let index = visibleWalls.length - 1; index >= 0; index -= 1) {
        const wall = visibleWalls[index];
        const length = wallSegmentLength(wall.start, wall.end);
        if (length < 1e-6) {
          continue;
        }
        const dx = wall.end[0] - wall.start[0];
        const dy = wall.end[1] - wall.start[1];
        const t = Math.max(
          0,
          Math.min(1, ((planX - wall.start[0]) * dx + (planY - wall.start[1]) * dy) / (length * length)),
        );
        const projX = wall.start[0] + t * dx;
        const projY = wall.start[1] + t * dy;
        if (Math.hypot(planX - projX, planY - projY) <= threshold) {
          return wall;
        }
      }
      return null;
    },
    [visibleWalls],
  );

  const commitItem = useCallback(
    (nextItem: FurnitureInstance) => {
      const result = moveInstance(nextItem, config, nextItem.position);
      if (!result.ok || !result.item) {
        setPlacementHint(placementBlockedHint);
        return false;
      }
      updateFurniture(buildingId, (items) =>
        items.map((item) => (item.id === result.item!.id ? result.item! : item)),
      );
      setPlacementHint(null);
      return true;
    },
    [buildingId, config, updateFurniture],
  );

  const placeItem = useCallback(
    (catalogId: string, _zone: FloorPlanZone, planX: number, planY: number) => {
      const result = placeFromPlanPoint(catalogId, buildingId, config, layout, planX, planY);
      if (!result.ok || !result.item) {
        setPlacementHint(placementBlockedHint);
        return;
      }
      updateFurniture(buildingId, (items) => [...items, result.item!]);
      setSelectedFurnitureId(result.item!.id);
      setPlaceCatalogId(null);
      setPlacementHint(null);
    },
    [buildingId, config, layout, setPlaceCatalogId, setSelectedFurnitureId, updateFurniture],
  );

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = clientToPlan(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const [planX, planY] = point;

    if (architecture.freeform_enabled && planTool === "wall") {
      const hitWall = wallAtPoint(planX, planY);
      if (hitWall) {
        setSelectedWallId(hitWall.id);
        setWallDrawAnchor(null);
        return;
      }
      if (!wallDrawAnchor) {
        setWallDrawAnchor(snapWallPoint(planX, planY));
        setSelectedWallId(null);
        return;
      }
      const segment = createWallSegment(activeArchitectureFloor, wallDrawAnchor, [planX, planY]);
      if (segment) {
        patchOfficeDraft(buildingId, {
          architecture: {
            ...architecture,
            walls: [...architecture.walls, segment],
          },
        });
        setSelectedWallId(segment.id);
      }
      setWallDrawAnchor(null);
      return;
    }

    const hit = hitFurnitureAtPoint(config.furniture, layout, planX, planY);

    if (hit) {
      const coords = itemToPlanCoords(hit, layout);
      if (!coords) {
        return;
      }
      dragRef.current = {
        id: hit.id,
        offsetX: planX - coords.x,
        offsetY: planY - coords.y,
      };
      setSelectedFurnitureId(hit.id);
      setActiveZone(hit.zone);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const zone = zoneAtPlanPoint(layout, planX, planY);
    if (!zone) {
      setSelectedFurnitureId(null);
      return;
    }

    setActiveZone(zone.id);
    if (placeCatalogId) {
      placeItem(placeCatalogId, zone, planX, planY);
      return;
    }

    setSelectedFurnitureId(null);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const point = clientToPlan(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const [planX, planY] = point;
    const item = config.furniture.find((entry) => entry.id === drag.id);
    if (!item) {
      return;
    }
    const zone = layout.zones.find((entry) => entry.id === item.zone);
    if (!zone) {
      return;
    }
    const position = planCoordsToItemPosition(
      zone,
      planX - drag.offsetX,
      planY - drag.offsetY,
    );
    const preview = { ...item, position };
    const entry = getCatalogEntry(item.catalog_id);
    if (!entry) {
      return;
    }
    const room = zoneDimensions(config, item.zone);
    const [x, y, z] = clampToZone(preview, entry.footprint, room);
    const clamped = { ...preview, position: [x, y, z] as [number, number, number] };
    const others = config.furniture.filter((entry) => entry.id !== item.id);
    const valid = isFurniturePlacementValid(clamped, others, entry.footprint, room);
    setDragPreview({ id: item.id, position: [x, y, z], valid });
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      const item = config.furniture.find((entry) => entry.id === dragRef.current?.id);
      const preview = dragPreview?.id === dragRef.current.id ? dragPreview.position : item?.position;
      if (item && preview && dragPreview?.valid !== false) {
        commitItem({ ...item, position: preview });
      } else if (item && dragPreview?.valid === false) {
        setPlacementHint("呢度冇位 — 每件傢俬都要有自己嘅面積，唔可以疊住");
      }
      dragRef.current = null;
      setDragPreview(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const selectedItem = selectedFurnitureId
    ? config.furniture.find((item) => item.id === selectedFurnitureId)
    : null;
  const selectedEntry = selectedItem ? getCatalogEntry(selectedItem.catalog_id) : null;
  const selectedLabel = selectedEntry?.label ?? null;
  const selectedDims = selectedEntry ? formatFootprintDimensions(selectedEntry.footprint) : null;

  return (
    <section className="design-floor-plan-editor">
      <div className="design-floor-plan-chrome">
        <div className="design-zone-tabs">
        {layout.zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={`design-zone-tab${activeZone === zone.id ? " active" : ""}`}
            onClick={() => setActiveZone(zone.id)}
          >
            {zone.label}
          </button>
        ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        className="design-floor-plan-svg"
        viewBox={viewBox}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <pattern
            id="floor-grid-fine"
            width={FLOOR_PLAN_FINE_GRID}
            height={FLOOR_PLAN_FINE_GRID}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${FLOOR_PLAN_FINE_GRID} 0 L 0 0 0 ${FLOOR_PLAN_FINE_GRID}`}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.015"
            />
          </pattern>
          <pattern
            id="floor-grid-coarse"
            width={FLOOR_PLAN_COARSE_GRID}
            height={FLOOR_PLAN_COARSE_GRID}
            patternUnits="userSpaceOnUse"
          >
            <rect
              width={FLOOR_PLAN_COARSE_GRID}
              height={FLOOR_PLAN_COARSE_GRID}
              fill="url(#floor-grid-fine)"
            />
            <path
              d={`M ${FLOOR_PLAN_COARSE_GRID} 0 L 0 0 0 ${FLOOR_PLAN_COARSE_GRID}`}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="0.03"
            />
          </pattern>
        </defs>

        <rect
          x={-PLAN_PADDING}
          y={-PLAN_PADDING}
          width={layout.maxWidth + PLAN_PADDING * 2}
          height={layout.totalDepth + PLAN_PADDING * 2}
          fill="url(#floor-grid-coarse)"
        />

        {layout.zones.map((zone) => (
          <g key={zone.id}>
            <rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.depth}
              className={`design-floor-zone${activeZone === zone.id ? " active" : ""}`}
              rx={0.15}
            />
            <text
              x={zone.x + 0.18}
              y={zone.y + 0.28}
              className="design-floor-zone-marker"
              fontSize={0.22}
            >
              {ZONE_MARKERS[zone.id]}
            </text>
          </g>
        ))}

        {architecture.freeform_enabled
          ? visibleWalls.map((wall) => (
              <line
                key={wall.id}
                x1={wall.start[0]}
                y1={wall.start[1]}
                x2={wall.end[0]}
                y2={wall.end[1]}
                className={`design-floor-wall${selectedWallId === wall.id ? " selected" : ""}`}
                strokeWidth={0.14}
              />
            ))
          : null}

        {architecture.freeform_enabled && wallDrawAnchor ? (
          <circle
            cx={wallDrawAnchor[0]}
            cy={wallDrawAnchor[1]}
            r={0.12}
            className="design-floor-wall-anchor"
          />
        ) : null}

        {config.furniture.map((item) => {
          const previewPosition =
            dragPreview?.id === item.id ? dragPreview.position : item.position;
          const renderItem = { ...item, position: previewPosition };
          const entry = getCatalogEntry(item.catalog_id);
          const coords = itemToPlanCoords(renderItem, layout);
          if (!entry || !coords) {
            return null;
          }
          const selected = item.id === selectedFurnitureId;
          const colliding =
            dragPreview?.id === item.id && dragPreview.valid === false;
          return (
            <g
              key={item.id}
              transform={`translate(${coords.x} ${coords.y}) rotate(${(item.rotation_y * 180) / Math.PI})`}
              className={`design-floor-furniture${selected ? " selected" : ""}${colliding ? " colliding" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedFurnitureId(item.id);
                setActiveZone(item.zone);
              }}
            >
              <FurniturePlanSilhouette
                catalogId={item.catalog_id}
                gltfPath={entry.gltfPath}
                footprint={entry.footprint}
                showDimensions={selected}
                title={entry.label}
              />
            </g>
          );
        })}
      </svg>

      <footer className="design-floor-plan-status">
        {placementHint ? (
          <span className="design-floor-plan-status-warn">{placementHint}</span>
        ) : placeCatalogId ? (
          <span>
            放置 <strong>{getCatalogEntry(placeCatalogId)?.label}</strong> — 平面或 3D 撳一下
          </span>
        ) : selectedLabel ? (
          <span>
            已選 <strong>{selectedLabel}</strong>
            {selectedDims ? (
              <>
                {" "}
                · <strong>{selectedDims}</strong>
              </>
            ) : null}{" "}
            · 拖曳移動 · R 旋轉 · Delete 刪除
          </span>
        ) : architecture.freeform_enabled && planTool === "wall" ? (
          <span>
            畫牆模式（{activeArchitectureFloor + 1}F）· 連續撳兩點 · 撳牆選取 · Delete 刪除
            {selectedWallId ? " · 已選牆段" : ""}
          </span>
        ) : (
          <span>拖曳傢俬 · 頂部工具列還原/旋轉 · 右邊 panel 揀傢俬</span>
        )}
      </footer>
    </section>
  );
}