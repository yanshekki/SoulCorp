import { BUILDING_STYLE_OPTIONS } from "../../data/designPresets";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  DEFAULT_BUILDING_VISUAL,
  type BuildingStyle,
  type BuildingVisualConfig,
} from "../../types/visualDesign";
import { ColorField } from "./ColorField";
import { useI18n } from "../../i18n/I18nProvider";

export function BuildingDesignPanel() {
  const { t } = useI18n();
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const setSelectedBuildingId = useDesignStudioStore((state) => state.setSelectedBuildingId);
  const draft = useDesignStudioStore((state) => state.draft);
  const patchDraft = useDesignStudioStore((state) => state.patchDraft);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const building = buildings.find((item) => item.id === buildingId);
  const config = draft.buildings[buildingId] ?? {
    ...DEFAULT_BUILDING_VISUAL,
    color: building?.color ?? DEFAULT_BUILDING_VISUAL.color,
    roof_color: building?.roofColor ?? DEFAULT_BUILDING_VISUAL.roof_color,
    accent_color: building?.accentColor ?? DEFAULT_BUILDING_VISUAL.accent_color,
    size: building?.size ?? DEFAULT_BUILDING_VISUAL.size,
    signage: building?.name ?? "",
  };

  const updateConfig = (patch: Partial<BuildingVisualConfig>) => {
    patchDraft({
      buildings: {
        ...draft.buildings,
        [buildingId]: { ...config, ...patch },
      },
    });
  };

  return (
    <section className="design-panel">
      <header>
        <h2>{t("design.buildingDesigner")}</h2>
        <p className="muted">{t("design.buildingDesignerDesc")}</p>
      </header>

      <label className="field-label">
        {t("design.deptBuilding")}
        <select
          value={buildingId}
          onChange={(event) => setSelectedBuildingId(event.target.value)}
        >
          {buildings.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.department}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        {t("design.signage")}
        <input
          type="text"
          value={config.signage}
          onChange={(event) => updateConfig({ signage: event.target.value })}
          maxLength={48}
        />
      </label>

      <div className="design-style-grid">
        {BUILDING_STYLE_OPTIONS.map((style) => (
          <button
            key={style.id}
            type="button"
            className={`design-style-card${config.style === style.id ? " active" : ""}`}
            onClick={() => updateConfig({ style: style.id as BuildingStyle })}
          >
            <strong>{t(`design.buildingStyle.${style.id}`)}</strong>
            <span>{t(`design.buildingStyle.${style.id}.desc`)}</span>
          </button>
        ))}
      </div>

      <ColorField label={t("design.facade")} value={config.color} onChange={(color) => updateConfig({ color })} />
      <ColorField
        label={t("design.roof")}
        value={config.roof_color}
        onChange={(roof_color) => updateConfig({ roof_color })}
      />
      <ColorField
        label={t("design.accentSignage")}
        value={config.accent_color}
        onChange={(accent_color) => updateConfig({ accent_color })}
      />

      <div className="design-slider-grid">
        {([t("design.width"), t("design.height"), t("design.depth")] as const).map((label, index) => (
          <label key={label} className="field-label">
            {label}
            <input
              type="range"
              min={2}
              max={6}
              step={0.1}
              value={config.size[index]}
              onChange={(event) => {
                const next = [...config.size] as [number, number, number];
                next[index] = Number(event.target.value);
                updateConfig({ size: next });
              }}
            />
            <span className="muted">{config.size[index].toFixed(1)}m</span>
          </label>
        ))}
      </div>
    </section>
  );
}